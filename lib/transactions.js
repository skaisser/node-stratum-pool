/**
 * @module transactions
 * @description Handles creation of coinbase/generation transactions for mining pools.
 * This module is responsible for building the transaction that pays out block rewards.
 */

var util = require('./util.js');


/*
function Transaction(params){

    var version = params.version || 1,
        inputs = params.inputs || [],
        outputs = params.outputs || [],
        lockTime = params.lockTime || 0;


    this.toBuffer = function(){
        return Buffer.concat([
            binpack.packUInt32(version, 'little'),
            util.varIntBuffer(inputs.length),
            Buffer.concat(inputs.map(function(i){ return i.toBuffer() })),
            util.varIntBuffer(outputs.length),
            Buffer.concat(outputs.map(function(o){ return o.toBuffer() })),
            binpack.packUInt32(lockTime, 'little')
        ]);
    };

    this.inputs = inputs;
    this.outputs = outputs;

}

function TransactionInput(params){

    var prevOutHash = params.prevOutHash || 0,
        prevOutIndex = params.prevOutIndex,
        sigScript = params.sigScript,
        sequence = params.sequence || 0;


    this.toBuffer = function(){
        sigScriptBuffer = sigScript.toBuffer();
        console.log('scriptSig length ' + sigScriptBuffer.length);
        return Buffer.concat([
            util.uint256BufferFromHash(prevOutHash),
            binpack.packUInt32(prevOutIndex, 'little'),
            util.varIntBuffer(sigScriptBuffer.length),
            sigScriptBuffer,
            binpack.packUInt32(sequence)
        ]);
    };
}

function TransactionOutput(params){

    var value = params.value,
        pkScriptBuffer = params.pkScriptBuffer;

    this.toBuffer = function(){
        return Buffer.concat([
            binpack.packInt64(value, 'little'),
            util.varIntBuffer(pkScriptBuffer.length),
            pkScriptBuffer
        ]);
    };
}

function ScriptSig(params){

    var height = params.height,
        flags = params.flags,
        extraNoncePlaceholder = params.extraNoncePlaceholder;

    this.toBuffer = function(){

        return Buffer.concat([
            util.serializeNumber(height),
            Buffer.from(flags, 'hex'),
            util.serializeNumber(Date.now() / 1000 | 0),
            Buffer.from([extraNoncePlaceholder.length]),
            extraNoncePlaceholder,
            util.serializeString('/EloPool.Cloud/')
        ]);
    }
};


var Generation = exports.Generation = function Generation(rpcData, publicKey, extraNoncePlaceholder){

    var tx = new Transaction({
        inputs: [new TransactionInput({
            prevOutIndex : Math.pow(2, 32) - 1,
            sigScript    : new ScriptSig({
                height                : rpcData.height,
                flags                 : rpcData.coinbaseaux.flags,
                extraNoncePlaceholder : extraNoncePlaceholder
            })
        })],
        outputs: [new TransactionOutput({
            value          : rpcData.coinbasevalue,
            pkScriptBuffer : publicKey
        })]
    });

    var txBuffer = tx.toBuffer();
    var epIndex  = buffertools.indexOf(txBuffer, extraNoncePlaceholder);
    var p1       = txBuffer.slice(0, epIndex);
    var p2       = txBuffer.slice(epIndex + extraNoncePlaceholder.length);

    this.transaction = tx;
    this.coinbase = [p1, p2];

};
*/


/*
     ^^^^ The above code was a bit slow. The below code is uglier but optimized.
 */



/**
 * Generates the output transactions for the coinbase transaction.
 * This includes payouts for masternodes, superblocks, pool fees, and the main pool reward.
 *
 * @private
 * @param {Buffer} poolRecipient - The pool's address script for receiving rewards
 * @param {Array<Object>} recipients - Array of fee recipients
 * @param {Object} rpcData - Block template data from daemon
 * @returns {Buffer} Serialized transaction outputs
 */
var generateOutputTransactions = function(poolRecipient, recipients, rpcData){

    var reward = rpcData.coinbasevalue;
    var rewardToPool = reward;

    var txOutputBuffers = [];



/* Dash 12.1 */
if (rpcData.masternode && rpcData.superblock) {
    if (rpcData.masternode.payee) {
        var payeeReward = 0;

        payeeReward = rpcData.masternode.amount;
        reward -= payeeReward;
        rewardToPool -= payeeReward;

        var payeeScript = util.addressToScript(rpcData.masternode.payee);
        txOutputBuffers.push(Buffer.concat([
            util.packInt64LE(payeeReward),
            util.varIntBuffer(payeeScript.length),
            payeeScript
        ]));
    } else if (rpcData.superblock.length > 0) {
        for(var i in rpcData.superblock){
            var payeeReward = 0;

            payeeReward = rpcData.superblock[i].amount;
            reward -= payeeReward;
            rewardToPool -= payeeReward;

            var payeeScript = util.addressToScript(rpcData.superblock[i].payee);
            txOutputBuffers.push(Buffer.concat([
                util.packInt64LE(payeeReward),
                util.varIntBuffer(payeeScript.length),
                payeeScript
            ]));
        }
    }
}

if (rpcData.payee) {
    var payeeReward = 0;

    if (rpcData.payee_amount) {
        payeeReward = rpcData.payee_amount;
    } else {
        payeeReward = Math.ceil(reward / 5);
    }

        reward -= payeeReward;
        rewardToPool -= payeeReward;

        var payeeScript = util.addressToScript(rpcData.payee);
        txOutputBuffers.push(Buffer.concat([
            util.packInt64LE(payeeReward),
            util.varIntBuffer(payeeScript.length),
            payeeScript
        ]));
    }



    for (var i = 0; i < recipients.length; i++){
        var recipientReward = Math.floor(recipients[i].percent * reward);
        rewardToPool -= recipientReward;

        txOutputBuffers.push(Buffer.concat([
            util.packInt64LE(recipientReward),
            util.varIntBuffer(recipients[i].script.length),
            recipients[i].script
        ]));
    }


    txOutputBuffers.unshift(Buffer.concat([
        util.packInt64LE(rewardToPool),
        util.varIntBuffer(poolRecipient.length),
        poolRecipient
    ]));

    if (rpcData.default_witness_commitment !== undefined){
        witness_commitment = Buffer.from(rpcData.default_witness_commitment, 'hex');
        txOutputBuffers.unshift(Buffer.concat([
            util.packInt64LE(0),
            util.varIntBuffer(witness_commitment.length),
            witness_commitment
        ]));
    }

    return Buffer.concat([
        util.varIntBuffer(txOutputBuffers.length),
        Buffer.concat(txOutputBuffers)
    ]);

};


/**
 * Creates a generation (coinbase) transaction for a new block.
 * The transaction is split at the extranonce placeholder to allow miners
 * to provide their own extranonce values.
 *
 * @function CreateGeneration
 * @param {Object} rpcData - Block template data from getblocktemplate RPC
 * @param {Buffer} publicKey - Pool's public key script for receiving rewards
 * @param {Buffer} extraNoncePlaceholder - Placeholder bytes for extranonce
 * @param {string} reward - Reward type ('POW' or 'POS')
 * @param {boolean} txMessages - Whether to include transaction messages
 * @param {Array<Object>} recipients - Array of fee recipients with percent and script
 * @param {string} [minerName] - Optional miner name to include in coinbase signature
 * @returns {Array<Buffer>} Two-part transaction split at extranonce placeholder
 */
exports.CreateGeneration = function(rpcData, publicKey, extraNoncePlaceholder, reward, txMessages, recipients, minerName){

    var txInputsCount = 1;
    var txOutputsCount = 1;
    var txVersion = txMessages === true ? 2 : 1;
    var txLockTime = 0;

    var txInPrevOutHash = "";
    var txInPrevOutIndex = Math.pow(2, 32) - 1;
    var txInSequence = 0;

    //Only required for POS coins
    var txTimestamp = reward === 'POS' ?
        util.packUInt32LE(rpcData.curtime) : Buffer.alloc(0);

    //For coins that support/require transaction comments
    var txComment = txMessages === true ?
        util.serializeString('https://github.com/zone117x/node-stratum') :
        Buffer.alloc(0);


    var scriptSigPart1 = Buffer.concat([
        util.serializeNumber(rpcData.height),
        Buffer.alloc(0),
        util.serializeNumber(Date.now() / 1000 | 0),
        Buffer.from([extraNoncePlaceholder.length])
    ]);

    // Include miner name if provided
    var poolSignature = minerName ?
        '/EloPool.Cloud/Mined by ' + minerName + '/' :
        '/EloPool.Cloud/';
    var scriptSigPart2 = util.serializeString(poolSignature);

    var p1 = Buffer.concat([
        util.packUInt32LE(txVersion),
        txTimestamp,

        //transaction input
        util.varIntBuffer(txInputsCount),
        util.uint256BufferFromHash(txInPrevOutHash),
        util.packUInt32LE(txInPrevOutIndex),
        util.varIntBuffer(scriptSigPart1.length + extraNoncePlaceholder.length + scriptSigPart2.length),
        scriptSigPart1
    ]);


    /*
    The generation transaction must be split at the extranonce (which located in the transaction input
    scriptSig). Miners send us unique extranonces that we use to join the two parts in attempt to create
    a valid share and/or block.
     */


    var outputTransactions = generateOutputTransactions(publicKey, recipients, rpcData);

    var p2 = Buffer.concat([
        scriptSigPart2,
        util.packUInt32LE(txInSequence),
        //end transaction input

        //transaction output
        outputTransactions,
        //end transaction ouput

        util.packUInt32LE(txLockTime),
        txComment
    ]);

    return [p1, p2];

};
