const Session = require("./models/Session")
const Bank = require("./models/Bank")
const Account = require("./models/Account")
const mongoose = require('mongoose')
const fetch = require('node-fetch')
const Transaction = require("./models/Transaction")
const jose = require('node-jose')
const fs = require('fs')


exports.verifyToken = async (req, res, next) => {

    // Check Authorization header existence
    let authorizationHeader = req.header('Authorization')
    if (!authorizationHeader) {
        return res.status(401).send({error: 'Missing Authorization header'})
    }

    // Split Authorization header by space
    authorizationHeader = authorizationHeader.split(' ')

    // CHeck that Authorization header includes a space
    if (!authorizationHeader[1]) {
        return res.status(400).send({error: 'Invalid Authorization header format'})
    }

    // Validate that the provided token conforms to MongoDB id format
    if (!mongoose.Types.ObjectId.isValid(authorizationHeader[1])) {
        return res.status(401).send({error: 'Invalid token'})
    }

    // Find a session with given token
    const session = await Session.findOne({_id: authorizationHeader[1]})

    // Check that the session existed
    if (!session) return res.status(401).send({error: 'Invalid token'})

    // Store the user's id in the req objects
    req.userId = session.userId
    req.sessionId = session.id

    return next(); // Pass the execution to the next middleware function
}

exports.refreshListOfBanksFromCentralBank = async function refreshListOfBanksFromCentralBank() {
    console.log('Refreshing list of banks')

    try {
        // Attempt to get a list of banks in JSON format from central bank
        let banks = await fetch(process.env.CENTRAL_BANK_URL, {
            headers: {'Api-Key': process.env.CENTRAL_BANK_APIKEY}
        }).then(responseText => responseText.json())

        // Delete all data from banks collection
        await Bank.deleteMany()

        // Initialize bulk operation object
        const bulk = Bank.collection.initializeUnorderedBulkOp()

        // Set up data for bulk insert
        banks.forEach(bank => {
            bulk.insert(bank)
        })

        // Bulk insert (in parallel) all prepared data to DB
        await bulk.execute()

        console.log('Done')
        return true

    } catch (e) {

        // Handle errors
        console.log(e.message)
        return {error: e.message}
    }


}

function isExpired(transaction) {

    const transactionExpiryTime = new Date(transaction.createdAt.setDate(transaction.createdAt.getDate() + 3))
    return new Date > transactionExpiryTime

}

async function setStatus(transaction, status, statusDetail) {
    transaction.status = status
    transaction.statusDetail = statusDetail
    await transaction.save();
}

async function createSignedTransaction(input) {
    // Create JWT
    let privateKey
    try {
        privateKey = fs.readFileSync('private.key', 'utf8')
        //console.log('privateKey: ' + privateKey)
        const keystore = jose.JWK.createKeyStore();
        const key = await keystore.add(privateKey, 'pem')
        return await jose.JWS.createSign({format: 'compact'}, key).update(JSON.stringify(input), "utf8").final()
    } catch (err) {
        console.error('Error reading private key ' + err)
        throw Error('Error reading private key ' + err)
    }


}

async function sendRequestToBank(destinationBank, transactionAsJwt) {
    return await exports.sendPostRequest(destinationBank.transactionUrl, {jwt: transactionAsJwt});
}

exports.sendPostRequest = async (url, data) => {
    return await exports.sendRequest('post', url, data)
}

exports.sendGetRequest = async (url) => {
    return await exports.sendRequest('get', url, null)
}

exports.sendRequest = async (method, url, data) => {
    let responseText = '';

    let options = {
        method,
        headers: {'Content-Type': 'application/json'}
    }

    if (data) {
        options.body = JSON.stringify(data)
    }

    try {
        responseText = await (await fetch(url, options)).text()
        return JSON.parse(responseText)
    } catch (e) {
        throw new Error('sendRequest(' + url + '): ' + e.message + (typeof responseText === 'undefined' ? '' : '|' + responseText))
    }
}

async function refund(transaction) {
    const accountFrom = await Account.findOne({number: transaction.accountFrom})
    if (!accountFrom) {
        return console.log('Account not found: ' + transaction.accountFrom)
    }
    accountFrom.balance += transaction.amount
    await accountFrom.save()
}

exports.processTransactions = async function () {

    // Get pendingTransactions
    const pendingTransactions = await Transaction.find({status: 'Pending'})

    // Loop through all pending transactions
    pendingTransactions.forEach(async transaction => {
        // Assert that the transaction has not started
        if (isExpired(transaction)) {
            await setStatus(transaction, 'Failed', 'Transaction has expired');
            await refund(transaction)
            return
        }

        // Set transaction status to in progress
        await setStatus(transaction, 'In progress');

        // Get the bank of accountTo
        let bankPrefix = transaction.accountTo.substring(0, 3);
        let destinationBank = await Bank.findOne({bankPrefix})

        // If we don't have the bank in local database
        if (!destinationBank) {
            let result = exports.refreshListOfBanksFromCentralBank()

            if (typeof result.error !== 'undefined') {
                return await setStatus(transaction, 'Pending', 'Central bank refresh failed: ' + result.error)

            }
            destinationBank = Bank.findOne({bankPrefix})
            if (!destinationBank) {
                console.log('Failed', 'Bank' + bankPrefix + ' does not exist')
                await refund(transaction);
                return await setStatus(transaction, 'Failed', 'Bank ' + bankPrefix + ' does not exist')
            }
        }

        try {
            const response = await sendRequestToBank(destinationBank, await createSignedTransaction({
                    accountFrom: transaction.accountFrom,
                    accountTo: transaction.accountTo,
                    amount: transaction.amount,
                    currency: transaction.currency,
                    explanation: transaction.explanation,
                    senderName: transaction.senderName
                }
            ));
            if (typeof response.error !== 'undefined') {
                return await setStatus(transaction, 'Failed', response.error)
            }

            transaction.receiverName = response.receiverName;
            console.log('Completed transaction ' + transaction._id)
            return await setStatus(transaction, 'Completed', '')

        } catch (e) {
            console.log('Error sending request to destination bank: ')
            console.log('- Transaction id is: ' + transaction._id)
            console.log('- Error is: ' + e.message)
            return await setStatus(transaction, 'Pending', e.message);
        }

    }, Error)


    // Recursively call itself again
    setTimeout(exports.processTransactions, 1000)
}