import mongoose from "mongoose";

const userSchema = mongoose.Schema({
    name:{
        type: String,
        required: true
    },
    email:{
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    }
    ,
    facebook: {
        pageId: { type: String },
        pageName: { type: String },
        pageAccessToken: { type: String }
    },
    instagram: {
        userId: { type: String },
        username: { type: String },
        pageId: { type: String },
        pageName: { type: String },
        pageAccessToken: { type: String },
        accessToken: { type: String },
        expiresAt: { type: Date }
    },
    threads: {
        userId: { type: String },
        accessToken: { type: String },
        expiresAt: { type: Date }
    },
    x: {
        userId: { type: String },
        username: { type: String },
        name: { type: String },
        accessTokenEncrypted: { type: String },
        refreshTokenEncrypted: { type: String },
        expiresAt: { type: Date },
        oauthState: { type: String },
        codeVerifier: { type: String },
        oauthStateExpiresAt: { type: Date }
    }
},
    {
        timestamps: true
    } 
)

const User = mongoose.model("User", userSchema)

export default User;