use openzeppelin_interfaces::erc721::{IERC721MetadataDispatcher, IERC721MetadataDispatcherTrait};
use snforge_std::{CheatSpan, cheat_caller_address};
use starknet::ClassHash;
use crate::denshokan::{
    IDenshokanMetadataLibAdminDispatcher, IDenshokanMetadataLibAdminDispatcherTrait,
};
use crate::tests::setup::{ALICE, OWNER, setup_with_registry};

// NOTE: token_uri SVG rendering tests have been removed because the game-components
// SVG renderer exceeds snforge's default step limit. token_uri is verified on-chain.

#[test]
#[should_panic]
fn test_token_uri_reverts_for_nonexistent_token() {
    let tc = setup_with_registry();

    let metadata_dispatcher = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };

    // Token 999 does not exist, should revert via _require_owned
    metadata_dispatcher.token_uri(999);
}

#[test]
fn test_name_and_symbol() {
    let tc = setup_with_registry();

    let metadata_dispatcher = IERC721MetadataDispatcher { contract_address: tc.denshokan_address };

    let name = metadata_dispatcher.name();
    let symbol = metadata_dispatcher.symbol();

    assert!(name == "Denshokan", "Name should be Denshokan");
    assert!(symbol == "DNSK", "Symbol should be DNSK");
}

// ================================================================================================
// METADATA LIBRARY CLASS HASH
//
// token_uri assembles its JSON via a library call, so the class hash must be set.
// A contract upgraded from a pre-library class starts with that slot EMPTY, and
// token_uri reverts until it is set — hence `upgrade` and
// `set_metadata_lib_class_hash` must go out in a single multicall.
//
// That revert is NOT unit-tested here: as the note at the top of this file says,
// token_uri cannot run under snforge at all (the game-components SVG renderer
// exceeds the step limit, and a mint-time minter address that is not a deployed
// contract aborts the runner rather than returning a catchable syscall error).
// What is pinned below is the admin surface that sets the slot, plus its zero
// guard; the constructor carries the same assert for fresh deploys.
// ================================================================================================

#[test]
fn test_owner_can_set_metadata_lib_class_hash() {
    let tc = setup_with_registry();
    let admin = IDenshokanMetadataLibAdminDispatcher { contract_address: tc.denshokan_address };

    let new_hash: ClassHash = 0x1234.try_into().unwrap();
    cheat_caller_address(tc.denshokan_address, OWNER(), CheatSpan::TargetCalls(1));
    admin.set_metadata_lib_class_hash(new_hash);

    assert!(admin.metadata_lib_class_hash() == new_hash, "class hash should be updated");
}

#[test]
#[should_panic]
fn test_non_owner_cannot_set_metadata_lib_class_hash() {
    let tc = setup_with_registry();
    let admin = IDenshokanMetadataLibAdminDispatcher { contract_address: tc.denshokan_address };

    cheat_caller_address(tc.denshokan_address, ALICE(), CheatSpan::TargetCalls(1));
    admin.set_metadata_lib_class_hash(0x1234.try_into().unwrap());
}

#[test]
#[should_panic]
fn test_cannot_set_zero_metadata_lib_class_hash() {
    let tc = setup_with_registry();
    let admin = IDenshokanMetadataLibAdminDispatcher { contract_address: tc.denshokan_address };

    cheat_caller_address(tc.denshokan_address, OWNER(), CheatSpan::TargetCalls(1));
    admin.set_metadata_lib_class_hash(0.try_into().unwrap());
}
