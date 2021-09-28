const mongoose = require('mongoose')

module.exports = mongoose.model('User', mongoose.Schema({
    name: {type: String, required: true, min: 2, max: 255},
    username: {type: String, required: true, min: 2, max: 255, unique: true},
    password: {type: String, required: true, min: 8, max: 255},
    accounts: [
        {type: mongoose.Schema.Types.ObjectId, ref: "Account"}
    ]
}))