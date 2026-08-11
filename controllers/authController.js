import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/User.js";


export const signup = async (req, res) => {
    try {

        const { name, email, password } = req.body;

        const exists = await User.findOne({ email })

        if (exists) {
            return res.status(400).json({
                success: false,
                message: "User Already Exists with this Email"
            })
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = User.create({
            name,
            email,
            password: hashedPassword
        })

        res.status(201).json({
            success: true,
            message: "Signup Successfully",
            user
        })
    } catch (error) {
        res.status(500).send("User not Created" + error)
    }
}


export const login = async (req, res) => {
    
    try{
        const {email, password} = req.body;

        const user = await User.findOne({email});

        if(!user){
            return res.status(400).json({
                success: false,
                message : "Invalid Credentials"
            });
        }
        console.log(password);
        console.log(user.password);

        const isMatch = bcrypt.compare(password, user.password);

        if(!isMatch){
            return res.status(400).json({
                success: false,
                message: "Invalid Credentails"
            });
        }

        const token = jwt.sign(
            {id: user._id},
            process.env.JWT_SECRET,
            {expiresIn: "7d"}
        )

        res.status(200).json({
            success: true,
            token,
            user
        });

    }catch (error) {
        res.status(500).json({
            success: false,
            message: error
        })
    }
}