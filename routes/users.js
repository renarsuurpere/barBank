const bcrypt = require("bcrypt");
const router = require("express").Router()
const User = require("../models/User")
const Account = require("../models/Account")

router.post('/', async function (req, res) {

    try {

        // Validate password
        if (req.body.password === undefined || req.body.password.length < 8) {
            return res.status(400).send({error: 'Invalid password'});
        }

        // Hash the password
        req.body.password = await bcrypt.hash(req.body.password, 10)

        // Store user into database
        const user = await new User(req.body).save()
        await new Account({userId: user.id}).save()
        return res.status(201).end()
    } catch (e) {

        // 409 Username already exists
        if (/E11000.*username.* dup key.*/.test(e.message)) {
            return res.status(409).send({error: 'User already exists'})
        }

        // 400 Required parameter missing
        if (/User validation failed: .*: Path `.*` is required.*/.test(e.message)) {
            return res.status(400).send({error: e.message})
        }

        console.log(e.message)
        console.log(e.code)
        // 500
        return res.status(500).send({error: e.message})
    }

})
module.exports = router
