const express = require('express');
const app = express()
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express')
const yamljs = require('yamljs')
const swaggerDocument = yamljs.load('docs/swagger.yaml')
const {processTransactions} = require("./middlewares")

require('dotenv').config()

// Serve API documentation on /docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

// Parse request body as JSON into req.body
app.use(express.json())

// endpoints
app.use('/users', require('./routes/users'))
app.use('/sessions', require('./routes/sessions'))
app.use('/transactions', require('./routes/transactions'))

mongoose.connect(process.env.MONGO_URL, {}, function (){
    console.log('Connected to mongoDB')
})

processTransactions()


app.listen(3000, function () {
    console.log('Listening on port 3000')
})