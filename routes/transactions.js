const router = require("express").Router()
const User = require("../models/User")
const Account = require("../models/Account")
const Bank = require("../models/Bank")
const Transaction = require("../models/Transaction")
const {verifyToken, refreshListOfBanksFromCentralBank} = require('../middlewares')



router.post('/', verifyToken, async function (req, res) {

    function debitAccount(accountFrom, amount) {
        accountFrom.balance -= req.body.amount
        accountFrom.save()
    }

    try {

        let statusDetail;

        // Get account data from DB
        const accountFrom = await Account.findOne({number: req.body.accountFrom, userId: req.userId})

        // 404 accountFrom not found
        if (!accountFrom) {
            return res.status(404).send({error: "accountFrom not found"})
        }

        // 403 Forbidden
        if (accountFrom.userId.toString() !== req.userId.toString()) {
            return res.status(403).send({error: "Forbidden"})
        }

        // 402 Insufficient funds
        if (req.body.amount > accountFrom.balance) {
            return res.status(402).send({error: "Insufficient funds"})
        }

        // Check for invalid amounts
        if (req.body.amount <= 0) {
            return res.status(400).json({error: "Invalid amount"})
        }

        //Get accountTo bank prefix
        const bankToPrefix = req.body.accountTo.slice(0, 3)
        let bankTo = await Bank.findOne({bankPrefix: bankToPrefix})

        if (!bankTo) {

            // Refresh the list of bank from central bank
            const result = await refreshListOfBanksFromCentralBank()
            console.log(result)

            if (typeof result.error !== 'undefined') {
                console.log('There was an error communicating with central bank')
                console.log(result.error)
                statusDetail = result.error
            } else {
                // Try again (after bank list has been refreshed)
                let bankTo = await Bank.findOne({bankPrefix: bankToPrefix})

                if (!bankTo) {
                    return res.status(400).json({error: 'Invalid accountTo'})
                }
            }

        } else {
            console.log('Bank was cached')
        }


        // Add a transaction to DB
        await new Transaction({
            userId: req.userId,
            amount: req.body.amount,
            currency: accountFrom.currency,
            accountFrom: req.body.accountFrom,
            accountTo: req.body.accountFrom,
            explanation: req.body.explanation,
            statusDetail,
            senderName: (await User.findOne( {id: req.userId})).name
        }).save()

        // Subtract amount from account
        debitAccount(accountFrom, req.body.amount);

        // 201 Created
        return res.status(201).end()
    } catch (e) {

        // 400 Invalid amount
        if (/.*Cast to Number failed for value .*amount/.test(e.message)
            || /Transaction validation failed: amount.*/.test(e.message)) {
            return res.status(400).send({error: "Invalid amount"})
        }

        // 400 Bad request
        if (/Transaction validation failed: explanation: .+/.test(e.message)) {
            return res.status(400).send({error: e.message})
        }
        // 500 Don't know what happened - internal server error
        console.log(e.message)
        return res.status(500).end()
    }
})

router.post('/b2b', async (req, res) => {
    return res.send({receiverName: 'Jaan Tamm'})
})

module.exports = router

