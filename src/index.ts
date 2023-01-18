// Config could include:
//  - Default NFT contract address
//  - A list of accepted rental contract address. Default to NiftyRent main address.
//  - Caching strategy: cache expire time
type Config = {}

class NiftyRent {
    config: Config
    constructor(config: Config) {
        this.config = config;
    }

    is_rented(token_id: string, contract_addr: string): boolean {
        return true;
    }
}
