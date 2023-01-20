import { connect, Near, Contract } from "near-api-js";

// near-api-js relies on the built-in modules. For better compatibility define them explicitly.
// https://github.com/vitejs/vite/issues/7555#issuecomment-1141193871
import { Buffer } from 'buffer';
import process from 'process';
window.Buffer = Buffer;
window.process = process;



// Config could include:
//  - Caching strategy: cache expire time
export type Config = {
    networkId?: string,
    rpcNodeUrl?: string,
    // Default NFT contract address
    defaultContractAddr?: string,
    // A list of accepted rental contract address. Default to NiftyRent main address.
    allowedRentalProxies?: Array<string>,
}

function defaultRpcNodeUrl(networkId: string): string {
    switch (networkId) {
        case "mainnet":
            return "https://rpc.mainnet.near.org"
        default:
            return "https://rpc.testnet.near.org"
    }
}

function defaultRentalProxies(networkId: string): Array<string> {
    switch (networkId) {
        case "mainnet":
            return ["nft-rental.near"]
        default:
            return ["nft-rental.testnet"]
    }
}

export class NiftyRent {
    readonly networkId: string;
    readonly rpcNodeUrl: string;
    readonly defaultContractAddr?: string;
    readonly allowedRentalProxies: Array<string>;

    nearApi?: Near;
    defaultNftContract?: Contract;
    rentalContracts: Map<string, Contract> = new Map();


    constructor(config: Config = {}) {
        this.networkId = config.networkId || "testnet";
        this.rpcNodeUrl = config.rpcNodeUrl || defaultRpcNodeUrl(this.networkId);
        this.defaultContractAddr = config.defaultContractAddr;
        this.allowedRentalProxies = config.allowedRentalProxies || defaultRentalProxies(this.networkId);
    }

    async init(): Promise<NiftyRent> {
        this.nearApi = await connect({
            networkId: this.networkId,
            nodeUrl: this.rpcNodeUrl,
        });

        if (this.defaultContractAddr) {
            this.defaultNftContract = await this.internalInitNftContract(this.defaultContractAddr)
        }

        for (let proxy of this.allowedRentalProxies) {
            this.rentalContracts.set(proxy, new Contract(await this.nearApi.account(""), proxy, {
                viewMethods: ["get_borrower_by_contract_and_token"],
                changeMethods: [],
            }));
        }
        return this;
    }


    async is_rented(tokenId: string, contractAddr?: string): Promise<boolean> {
        let nftContract = await this.internalResolveNftContract(contractAddr)
        let token = await (nftContract as any).nft_token({
            token_id: tokenId,
        })
        return token.owner_id in this.allowedRentalProxies;
    }

    async is_current_user(tokenId: string, user: string, contractAddr?: string): Promise<boolean> {
        let nftContract = await this.internalResolveNftContract(contractAddr)
        let token = await (nftContract as any).nft_token({
            token_id: tokenId,
        })
        if (token.owner_id == user) { return true }
        if (!(this.allowedRentalProxies.includes(token.owner_id))) { return false }
        let rentalContract = this.rentalContracts.get(token.owner_id)
        if (!rentalContract) {
            throw "rental contract not initialised"
        }
        let borrower = await (rentalContract as any).get_borrower_by_contract_and_token({
            contract_id: nftContract.contractId,
            token_id: tokenId,
        })
        return borrower && borrower == user;
    }

    async internalInitNftContract(contractAddr: string) {
        if (!this.nearApi) {
            throw "Please call init() first";
        }

        return new Contract(await this.nearApi.account(""), contractAddr, {
            viewMethods: ["nft_token"],
            changeMethods: [],
        })
    }

    async internalResolveNftContract(contractAddr: string | undefined): Promise<Contract> {
        let nftContract = this.defaultNftContract;
        if (contractAddr) {
            nftContract = await this.internalInitNftContract(contractAddr)
        }
        if (!nftContract) { throw "Please provide contractAddr or set the defaultContractAddr in the config" }
        return nftContract
    }
}
