use starknet::ContractAddress;

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct GameStarted {
    #[key]
    pub game_id: u64,
    pub player: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct MoveMade {
    #[key]
    pub game_id: u64,
    pub player_position: u8,
    pub ai_position: u8,
    pub status: u8,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct GameEnded {
    #[key]
    pub game_id: u64,
    pub player: ContractAddress,
    pub status: u8,
}
