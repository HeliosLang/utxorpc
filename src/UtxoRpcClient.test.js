import { makeTxOutputId } from "@helios-lang/ledger"
import { makeDemeterUtxoRpcClient } from "./UtxoRpcClient.js"

const PREPROD_API_KEY = ""

async function main() {
    const client = makeDemeterUtxoRpcClient(
        "https://preprod.utxorpc-v0.demeter.run",
        PREPROD_API_KEY
    )

    const utxo = await client.getUtxo(
        makeTxOutputId(
            "56e35073ff3766a8578ff50eab79a20e96994dbf4f2840b59ef17274e2761eb2#0"
        )
    )

    const parameters = await client.parameters

    console.log(utxo.dump(), parameters)
}

main()
