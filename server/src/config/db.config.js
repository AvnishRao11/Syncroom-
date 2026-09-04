import mongoose from 'mongoose'
import config from './config.js'
function mongoConnect() {
    mongoose.connect(config.mongoDbUri).then(() => {
        console.log('connected to mongo db')
    }).catch((err) => {
        console.log('error connecting to mongo db', err)
    })
}

export default mongoConnect;