import { connect, Near, Contract } from "near-api-js";

// near-api-js relies on the built-in modules. For better compatibility define them explicitly.
// https://github.com/vitejs/vite/issues/7555#issuecomment-1141193871
import { Buffer } from 'buffer';
import process from 'process';
window.Buffer = Buffer;
window.process = process;



/** Configuration struct for a new NiftyRent object. */
export type Config = {
    /** the NEAR network id, e.g. testnet, mainnet. Default to testnet. */
    networkId?: string,
    /** the NEAR RPC API node URL. Default to the official URL corresponding to the chosen network. */
    rpcNodeUrl?: string,
    /** The default NFT contract address, used when the contractAddress parameter is omitted. */
    defaultContractAddr?: string,
    /** A list of accepted rental contract address. Default to NiftyRent main address. */
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
    /**
     * Initialise the object to be ready for sending requests.
     * This is required because many async operations cannot be done in the constructor.
     */
    async init(): Promise<NiftyRent> {
        this.nearApi = await connect({
            networkId: this.networkId,
            nodeUrl: this.rpcNodeUrl,
        });

        if (this.defaultContractAddr) {
            this.defaultNftContract = await this.internalInitNftContract(this.defaultContractAddr)
        }

        for (let proxy of this.allowedRentalProxies) {
            // Use a dummy account name, since it's irrelvant for view-only requests.
            this.rentalContracts.set(proxy, new Contract(await this.nearApi.account(""), proxy, {
                viewMethods: ["get_borrower_by_contract_and_token"],
                changeMethods: [],
            }));
        }
        return this;
    }


    /** Returns whether the given NFT is rented in the allowed rental proxies. */
    async is_rented(tokenId: string, contractAddr?: string): Promise<boolean> {
        let nftContract = await this.internalResolveNftContract(contractAddr)
        let token = await (nftContract as any).nft_token({
            token_id: tokenId,
        })
        return token.owner_id in this.allowedRentalProxies;
    }

    /**
     * Returns whether the given user is the current legit user of the given NFT.
     *
     * One can be the current legit user of an NFT if:
     * - They are the borrower of an active lease of the NFT via an allowed rental proxy.
     * - Or, they are the owner and the NFT is not actively leased anywhere.
     */
    async is_current_user(user: string, tokenId: string, contractAddr?: string): Promise<boolean> {
        return await this.get_current_user(tokenId, contractAddr) === user;
    }

    /**
     * Returns current legit user of the given NFT.
     *
     * See the doc of `is_current_user` for the definition of an current legit user.
     */
    async get_current_user(tokenId: string, contractAddr?: string): Promise<string> {
        let nftContract = await this.internalResolveNftContract(contractAddr)
        let token = await (nftContract as any).nft_token({
            token_id: tokenId,
        })
        if (!(this.allowedRentalProxies.includes(token.owner_id))) { return token.owner_id }
        let rentalContract = this.rentalContracts.get(token.owner_id)
        if (!rentalContract) {
            throw "rental contract not initialised"
        }
        let borrower = await (rentalContract as any).get_borrower_by_contract_and_token({
            contract_id: nftContract.contractId,
            token_id: tokenId,
        })
        return borrower

    }

    async internalInitNftContract(contractAddr: string) {
        if (!this.nearApi) {
            throw "Please call init() first";
        }

        // Use a dummy account name, since it's irrelvant for view-only requests.
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
