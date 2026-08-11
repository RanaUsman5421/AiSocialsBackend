import mongoose from "mongoose";
import User from '../models/User.js'

export const getAllUsers = async (req, res) => {
    try{
        const users = await User.find();
        res.status(201).json({
            success: true,
            count: users.length,
            Users: users
        })
    }catch (err){
        res.status(400).josn({
            success: false,
            Error: err
        })
    }

}