const express = require('express');
const app = express()
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express')
const yamljs = require('yamljs')
const swaggerDocument = yamljs.load('docs/swagger.yaml')

require('dotenv').config()

// Serve API documentation on /docs
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

// Parse request body as JSON into req.body
app.use(express.json())

// endpoints
app.use('/users', require('./routes/users'))
app.use('/sessions', require('./routes/sessions'))

mongoose.connect(process.env.MONGO_URL, {}, function (){
    console.log('Connected to mongoDB')
})

app.listen(3000, function () {
    console.log('Listening on port 3000')
})