use starknet::ContractAddress;

// ================================================================================================
// TEST ADDRESSES
// ================================================================================================

pub fn OWNER() -> ContractAddress {
    'OWNER'.try_into().unwrap()
}

pub fn ALICE() -> ContractAddress {
    'ALICE'.try_into().unwrap()
}

pub fn BOB() -> ContractAddress {
    'BOB'.try_into().unwrap()
}

pub fn CHARLIE() -> ContractAddress {
    'CHARLIE'.try_into().unwrap()
}

pub fn GAME_CREATOR() -> ContractAddress {
    'GAME_CREATOR'.try_into().unwrap()
}

pub fn ROYALTY_RECIPIENT() -> ContractAddress {
    'ROYALTY_RECIPIENT'.try_into().unwrap()
}

// ================================================================================================
// TEST CONSTANTS
// ================================================================================================

// Royalty constants (in basis points)
pub const DEFAULT_ROYALTY_FRACTION: u128 = 500; // 5%
pub const CUSTOM_ROYALTY_FRACTION: u128 = 1000; // 10%
pub const MAX_ROYALTY_FRACTION: u128 = 10000; // 100%

// Sale price for royalty calculations
pub const SALE_PRICE: u256 = 1000000; // 1 million wei
pub const SMALL_SALE_PRICE: u256 = 100; // 100 wei
