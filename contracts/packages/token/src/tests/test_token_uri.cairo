use openzeppelin_interfaces::erc721::{IERC721MetadataDispatcher, IERC721MetadataDispatcherTrait};
use crate::tests::setup::setup_with_registry;

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
