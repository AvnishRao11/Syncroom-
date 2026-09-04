import dotenv from 'dotenv'

dotenv.config();

if(!process.env.PORT){
    throw new Error("PORT is not defined in .env file");
}
if(!process.env.MONGODB_URI){
    throw new Error("MONGODB_URI is not defined in .env file");
}



const config={
    port : process.env.PORT ,
    mongoDbUri: process.env.MONGODB_URI

}

export default config;