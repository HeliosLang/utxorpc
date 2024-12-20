import {
    CardanoQueryClient,
    CardanoSubmitClient,
    CardanoSyncClient
} from "@utxorpc/sdk"
import {
    decodeTxOutput,
    DEFAULT_CONWAY_PARAMS,
    makeTxId,
    makeTxInput,
    makeTxOutputId
} from "@helios-lang/ledger"
import { expectDefined } from "@helios-lang/type-utils"

/**
 * @import { Address, AssetClass, NetworkParams, Tx, TxId, TxInput, TxOutputId } from "@helios-lang/ledger"
 * @import { UtxoRpcClient } from "./index.js"
 */

/**
 * @param {string} endpoint
 * @param {string} apiKey
 * @returns {UtxoRpcClient}
 */
export function makeDemeterUtxoRpcClient(endpoint, apiKey) {
    return new DemeterUtxoRpcClient(endpoint, apiKey)
}

/**
 * @implements {UtxoRpcClient}
 */
class DemeterUtxoRpcClient {
    /**
     * @readonly
     * @type {string}
     */
    endpoint

    /**
     * @private
     * @readonly
     * @type {string}
     */
    apiKey

    /**
     * @private
     * @type {CardanoQueryClient | undefined}
     */
    _queryClient

    /**
     * @private
     * @type {CardanoSubmitClient | undefined}
     */
    _submitClient

    /**
     * @private
     * @type {CardanoSyncClient | undefined}
     */
    _syncClient

    /**
     * @param {string} endpoint
     * @param {string} apiKey
     */
    constructor(endpoint, apiKey) {
        this.endpoint = endpoint
        this.apiKey = apiKey

        this._queryClient = undefined
        this._submitClient = undefined
        this._syncClient = undefined
    }

    /**
     * @private
     * @type {CardanoQueryClient}
     */
    get queryClient() {
        if (!this._queryClient) {
            this._queryClient = new CardanoQueryClient({
                uri: this.endpoint,
                headers: { "dmtr-api-key": this.apiKey }
            })
        }

        return this._queryClient
    }

    /**
     * @private
     * @type {CardanoSubmitClient}
     */
    get submitClient() {
        if (!this._submitClient) {
            this._submitClient = new CardanoSubmitClient({
                uri: this.endpoint,
                headers: { "dmtr-api-key": this.apiKey }
            })
        }

        return this._submitClient
    }

    /**
     * @private
     * @type {CardanoSyncClient}
     */
    get syncClient() {
        if (!this._syncClient) {
            this._syncClient = new CardanoSyncClient({
                uri: this.endpoint,
                headers: { "dmtr-api-key": this.apiKey }
            })
        }

        return this._syncClient
    }

    /**
     * @type {Promise<NetworkParams>}
     */
    get parameters() {
        return (async () => {
            const tipFollower = this.syncClient.followTip()

            /**
             * @type {bigint | undefined}
             */
            let tipSlot = undefined

            /**
             * @type {number | undefined}
             */
            let tipTime = undefined

            // This is very slow, being able to query the current tip would be better
            for await (let t of tipFollower) {
                console.log(t)
                if (t.action == "apply") {
                    tipSlot = expectDefined(t.block.header?.slot)
                    tipTime = Date.now()
                    break
                }
            }

            const rawParams = await this.queryClient.readParams()
            const defaultParams = DEFAULT_CONWAY_PARAMS()

            /**
             * @type {NetworkParams}
             */
            const params = {
                maxTxSize: Number(rawParams.maxTxSize),
                txFeeFixed: Number(rawParams.minFeeConstant),
                txFeePerByte: Number(rawParams.minFeeCoefficient),
                maxCollateralInputs: Number(rawParams.maxCollateralInputs),
                collateralPercentage: Number(rawParams.collateralPercentage),
                maxTxExCpu: Number(
                    expectDefined(
                        rawParams.maxExecutionUnitsPerTransaction?.steps
                    )
                ),
                maxTxExMem: Number(
                    expectDefined(
                        rawParams.maxExecutionUnitsPerTransaction?.memory
                    )
                ),
                exCpuFeePerUnit: rawParams.prices?.steps
                    ? Number(rawParams.prices.steps.numerator) /
                      Number(rawParams.prices.steps.denominator)
                    : defaultParams.executionUnitPrices.priceSteps,
                exMemFeePerUnit: rawParams.prices?.memory
                    ? Number(rawParams.prices.memory.numerator) /
                      Number(rawParams.prices.memory.denominator)
                    : defaultParams.executionUnitPrices.priceMemory,
                stakeAddrDeposit: Number(rawParams.stakeKeyDeposit),
                utxoDepositPerByte: Number(rawParams.coinsPerUtxoByte),
                refScriptsFeePerByte: defaultParams.minFeeRefScriptCostPerByte, // TODO: get this from rawParams,
                costModelParamsV1: expectDefined(
                    rawParams.costModels?.plutusV1
                ).values.map((x) => Number(x)),
                costModelParamsV2: expectDefined(
                    rawParams.costModels?.plutusV2
                ).values.map((x) => Number(x)),
                costModelParamsV3: expectDefined(
                    rawParams.costModels?.plutusV3
                ).values.map((x) => Number(x)),
                refTipSlot: Number(expectDefined(tipSlot)),
                refTipTime: expectDefined(tipTime),
                secondsPerSlot: 1 // TODO: get this from rawParams
            }

            return params
        })()
    }

    /**
     * @type {number}
     */
    get now() {
        return Date.now()
    }

    /**
     * @returns {boolean}
     */
    isMainnet() {
        return !this.endpoint.toLowerCase().includes("preprod")
    }

    /**
     * @param {TxOutputId} id
     * @returns {Promise<TxInput>}
     */
    async getUtxo(id) {
        const [utxo] = await this.queryClient.readUtxosByOutputRef([
            {
                txHash: Uint8Array.from(id.txId.bytes),
                outputIndex: id.index
            }
        ])

        return convertUtxo(utxo)
    }

    /**
     * @param {Address} address
     * @returns {Promise<TxInput[]>}
     */
    async getUtxos(address) {
        const utxos = await this.queryClient.searchUtxosByAddress(
            Uint8Array.from(address.bytes)
        )

        return utxos.map(convertUtxo)
    }

    /**
     * @param {Address} address
     * @param {AssetClass} assetClass
     * @returns {Promise<TxInput[]>}
     */
    async getUtxosWithAssetClass(address, assetClass) {
        const utxos = await this.queryClient.searchUtxosByAddressWithAsset(
            Uint8Array.from(address.bytes),
            Uint8Array.from(assetClass.mph.bytes),
            Uint8Array.from(assetClass.tokenName)
        )

        return utxos.map(convertUtxo)
    }

    /**
     * Waits until a Tx is confirmed on-chain
     * Throws an error if options.onRollback isn't set and a rollback is detected (i.e. stage number decreases instead of increases)
     * @param {TxId} txId
     * @param {object} [options]
     * @param {() => any} [options.onRollback] - if not specified an error is thrown
     * @returns {Promise<void>}
     */
    async confirmTx(txId, options = {}) {
        const stageEmitter = this.submitClient.waitForTx(
            Uint8Array.from(txId.bytes)
        )

        let lastStage = 0

        for await (let stage of stageEmitter) {
            if (stage < lastStage) {
                if (options.onRollback) {
                    options.onRollback()
                    break
                }
            }

            lastStage = stage

            if (stage >= 4) {
                // ok
                break
            }
        }
    }

    /**
     * @param {Tx} tx
     * @returns {Promise<TxId>}
     */
    async submitTx(tx) {
        const txIdBytes = await this.submitClient.submitTx(
            Uint8Array.from(tx.toCbor())
        )

        return makeTxId(txIdBytes)
    }
}

/**
 * @param {any} utxo
 * @returns {TxInput}
 */
function convertUtxo(utxo) {
    const id = makeTxOutputId(makeTxId(utxo.txoRef.hash), utxo.txoRef.index)

    return makeTxInput(id, decodeTxOutput(expectDefined(utxo.nativeBytes)))
}
