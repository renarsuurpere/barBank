const mongoose = require('mongoose')

module.exports = mongoose.model('Account', mongoose.Schema({
        name: {type: String, required: true, minlength: 2, maxlength: 255, default: 'main'},
        number: {
            type: String, minlength: 11, maxlength: 255, default: function () {
                return process.env.BANK_PREFIX + require('md5')(new Date().toISOString())
            }
        },
        userId: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
        balance: {type: Number, required: true, min: 0, default: 10000},
        currency: {type: String, required: true, default: 'EUR'}
    },
    {
        toJSON: {
            transform: function (docIn, docOut) {
        delete docOut._id;
        delete docOut.__v;
        delete docOut.userId;
            }
        }
    }
))