/**
 * @import { Address, AssetClass, NetworkParams, Tx, TxId, TxInput, TxOutputId } from "@helios-lang/ledger"
 */

export { makeDemeterUtxoRpcClient } from "./UtxoRpcClient.js"

/**
 * TODO: add all available methods
 * @typedef {object} UtxoRpcClient
 * @prop {() => boolean} isMainnet
 * @prop {number} now
 * @prop {Promise<NetworkParams>} parameters
 * @prop {(id: TxOutputId) => Promise<TxInput>} getUtxo
 * @prop {(address: Address) => Promise<TxInput[]>} getUtxos
 * @prop {(address: Address, assetClass: AssetClass) => Promise<TxInput[]>} getUtxosWithAssetClass
 * @prop {(tx: Tx) => Promise<TxId>} submitTx
 */
