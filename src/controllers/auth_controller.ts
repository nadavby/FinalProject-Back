/* eslint-disable @typescript-eslint/no-explicit-any */
/** @format */

import { NextFunction, Request, Response } from "express";
import userModel from "../models/user_model";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { OAuth2Client } from "google-auth-library";

// Extend the Express Request interface
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

type Payload = {
  _id: string;
};

const client = new OAuth2Client();
const googleSignIn = async (req: Request, res: Response) => {
  try {
    const ticket = await client.verifyIdToken({
      idToken: req.body.credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload?.email;
    if (!email) {
      return res.status(400).send("Invalid credentials");
    }

    let user = await userModel.findOne({ email: email });
    const picture = payload?.picture;

    if (!user) {
      user = await userModel.create({
        email: email,
        password: " ",
        imgURL: picture,
        userName: email,
      });
      
    }
    const tokens = generateToken(user._id);
      if (!tokens) {
        return res.status(500).send("server error");
      }
      if (user.refreshToken == null) {
        user.refreshToken = [];
      }
      user.refreshToken.push(tokens.refreshToken);
      await user.save();
      return res.status(200).send({
        email: user.email,
        _id: user._id,
        imgUrl: user.imgURL,
        userName: user.userName,
        ...tokens,
      });
  } catch (err) {
    return res.status(400).send((err as Error).message);
  }
};

const register = async (req: Request, res: Response) => {
  try {
    const password = req.body.password;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    let ImgUrl = req.body.imgUrl;
    if (!ImgUrl) ImgUrl = null;
    if (await userModel.findOne({ userName: req.body.userName })) {
      return res.status(400).send("User name already exists");
    }
    if (await userModel.findOne({ email: req.body.email })) {
      return res.status(400).send("email already exists");
    }
    const user = await userModel.create({
      email: req.body.email,
      password: hashedPassword,
      imgURL: ImgUrl,
      userName: req.body.userName,
    });
    res.status(200).send(user);
  } catch (error) {
    res.status(400).send(error);
  }
};
const generateToken = (
  _id: string
): { accessToken: string; refreshToken: string } | null => {
  if (!process.env.TOKEN_SECRET || !process.env.TOKEN_EXPIRATION) {
    return null;
  }
  
  console.log("Generating new token with expiration:", process.env.TOKEN_EXPIRATION);
  
  const random = Math.floor(Math.random() * 1000000);
  const accessToken = jwt.sign(
    { _id: _id, random: random },
    process.env.TOKEN_SECRET,
    { expiresIn: "24h" } // Override with 24 hours for testing
  );
  const refreshToken = jwt.sign(
    { _id: _id, random: random },
    process.env.TOKEN_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRATION }
  );
  return { accessToken, refreshToken };
};
const login = async (req: Request, res: Response) => {
  try {
    const user = await userModel.findOne({ email: req.body.email });
    if (!user) {
      res.status(404).send("User or password incorrect");
      return;
    }
    const validPassword = await bcrypt.compare(
      req.body.password,
      user.password
    );
    if (!validPassword) {
      res.status(404).send("User or password incorrect");
      return;
    }
    const tokens = generateToken(user._id);
    if (!tokens) {
      res.status(500).send("server error");
      return;
    }
    console.log(user.refreshToken);
    console.log(tokens.refreshToken);
    if (user.refreshToken == null) {
      user.refreshToken = [];
    }
    user.refreshToken.push(tokens.refreshToken);
    await user.save();
    res.status(200).send({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      _id: user._id,
    });
  } catch (error) {
    res.status(400).send(error);
  }
};
const logout = async (req: Request, res: Response) => {
  const refreshToken = req.body.refreshToken;
  if (!refreshToken) {
    res.status(400).send("refreshToken is required");
    return;
  }
  if (!process.env.TOKEN_SECRET) {
    res.status(500).send("server error");
    return;
  }

  jwt.verify(
    refreshToken,
    process.env.TOKEN_SECRET,
    async (err: any, payload: any) => {
      if (err) {
        res.status(401).send("Unauthorized");
        return;
      }
      const data = payload as Payload;
      try {
        const user = await userModel.findOne({ _id: data._id });
        if (!user) {
          res.status(404).send("User not found");
          return;
        }
        if (!user.refreshToken || !user.refreshToken.includes(refreshToken)) {
          res.status(401).send("Unauthorized");
          user.refreshToken = [];
          await user.save();
          return;
        }
        user.refreshToken = user.refreshToken.filter((t) => t !== refreshToken);
        await user.save();
        res.status(200).send("Logged out");
      } catch (err) {
        res.status(400).send(err);
      }
    }
  );
};
const refresh = async (req: Request, res: Response) => {
  const refreshToken = req.body.refreshToken;
  if (!refreshToken) {
    res.status(400).send("refreshToken is required");
    return;
  }
  if (!process.env.TOKEN_SECRET) {
    res.status(500).send("server error");
    return;
  }
  jwt.verify(
    refreshToken,
    process.env.TOKEN_SECRET,
    async (err: any, payload: any) => {
      if (err) {
        res.status(401).send("Unauthorized");
        return;
      }
      const data = payload as Payload;
      try {
        const user = await userModel.findOne({ _id: data._id });
        if (!user) {
          res.status(404).send("User not found");
          return;
        }
        if (!user.refreshToken || !user.refreshToken.includes(refreshToken)) {
          res.status(402).send("Unauthorized");
          user.refreshToken = [];
          await user.save();
          return;
        }
        const tokens = generateToken(user._id);
        if (!tokens) {
          user.refreshToken = [];
          await user.save();
          res.status(500).send("server error");
          return;
        }
        user.refreshToken = user.refreshToken.filter((t) => t !== refreshToken);
        user.refreshToken.push(tokens.refreshToken);
        await user.save();
        res.status(200).send({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        });
      } catch (err) {
        res.status(400).send(err);
      }
    }
  );
};

export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authorization = req.header("authorization");
  if (!authorization) {
    console.error("Auth error: Missing authorization header");
    res.status(401).send("Unauthorized - Missing authorization header");
    return;
  }
  
  const parts = authorization.split(" ");
  if (parts.length !== 2) {
    console.error("Auth error: Invalid authorization format", authorization);
    res.status(401).send("Unauthorized - Invalid authorization format. Expected 'Bearer [token]' or 'JWT [token]'");
    return;
  }
  
  const prefix = parts[0];
  const token = parts[1];
  
  // Accept both 'Bearer' and 'JWT' prefixes
  if (prefix !== 'Bearer' && prefix !== 'JWT') {
    console.error(`Auth error: Invalid token prefix "${prefix}"`, authorization);
    res.status(401).send("Unauthorized - Invalid token prefix. Expected 'Bearer' or 'JWT'");
    return;
  }
  
  if (!token) {
    console.error("Auth error: Empty token");
    res.status(401).send("Unauthorized - Empty token");
    return;
  }
  
  if (!process.env.TOKEN_SECRET) {
    console.error("Auth error: TOKEN_SECRET not set in environment");
    res.status(500).send("Server configuration error - TOKEN_SECRET not set");
    return;
  }
  
  // Get the refresh token from the request, if present
  const refreshToken = req.header("refresh-token");
  
  // Verify the JWT token
  jwt.verify(token, process.env.TOKEN_SECRET, async (err, payload) => {
    // If token expired and we have a refresh token, try to refresh
    if (err && err.name === "TokenExpiredError" && refreshToken) {
      console.log("Token expired, attempting refresh with provided refresh token");
      try {
        // Verify the refresh token
        const refreshPayload = jwt.verify(refreshToken, process.env.TOKEN_SECRET!);
        if (!refreshPayload || typeof refreshPayload !== 'object' || !('_id' in refreshPayload)) {
          console.error("Invalid refresh token payload structure");
          return res.status(401).send("Unauthorized - Invalid refresh token");
        }
        
        // Find the user
        const user = await userModel.findOne({ _id: (refreshPayload as Payload)._id });
        if (!user) {
          console.error("User not found for refresh token");
          return res.status(401).send("Unauthorized - Invalid refresh token");
        }
        
        // Check if the refresh token is in the user's refresh tokens
        if (!user.refreshToken || !user.refreshToken.includes(refreshToken)) {
          console.error("Refresh token not found in user's refresh tokens");
          return res.status(401).send("Unauthorized - Invalid refresh token");
        }
        
        // Generate new tokens
        const tokens = generateToken(user._id);
        if (!tokens) {
          console.error("Failed to generate new tokens");
          return res.status(500).send("Server error - Failed to generate new tokens");
        }
        
        // Update user's refresh tokens
        user.refreshToken = user.refreshToken.filter(t => t !== refreshToken);
        user.refreshToken.push(tokens.refreshToken);
        await user.save();
        
        // Set the new tokens in the response headers
        res.setHeader("new-access-token", tokens.accessToken);
        res.setHeader("new-refresh-token", tokens.refreshToken);
        
        // Continue with the authenticated request
        req.userId = user._id;
        console.log(`User authenticated via token refresh: ${req.userId}`);
        return next();
      } catch (refreshErr) {
        console.error("Error refreshing token:", refreshErr);
        return res.status(401).send("Unauthorized - Invalid or expired refresh token");
      }
    }
    
    // Handle other verification errors
    if (err) {
      console.error("Auth error: Token verification failed", err);
      if (err.name === "TokenExpiredError") {
        return res.status(401).send("Unauthorized - Token expired");
      } else if (err.name === "JsonWebTokenError") {
        return res.status(401).send("Unauthorized - Invalid token");
      } else {
        return res.status(401).send(`Unauthorized - ${err.message}`);
      }
    }
    
    // Validate payload
    if (!payload || typeof payload !== 'object' || !('_id' in payload)) {
      console.error("Auth error: Invalid payload structure", payload);
      return res.status(401).send("Unauthorized - Invalid token payload");
    }
    
    // Authentication successful
    req.userId = (payload as Payload)._id;
    console.log(`User authenticated: ${req.userId}`);
    next();
  });
};

const getUserById = async (req: Request, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.params.id);
    const user = await userModel.findById(userId);
    if (!user) {
      res.status(404).send("User not found");
      return;
    }
    res.status(200).send(user);
  } catch (err) {
    res.status(400).send(err);
  }
};

const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await userModel.find();
    res.status(200).send(users);
  } catch (err) {
    res.status(400).send(err);
  }
};

const updateUser = async (req: Request, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.params.id);
    const updateData = req.body;

    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(req.body.password, salt);
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    if (req.body.userName && req.body.userName !== user.userName) {
      const newUserName = req.body.userName;
      const existingUser = await userModel.findOne({ userName: newUserName });
      if (existingUser) {
        return res.status(400).send("User name already exists");
      }
    }
    
    console.log(updateData);
    const updatedUser = await userModel.findByIdAndUpdate(userId, updateData, {
      new: true,
    });

    res.status(200).send(updatedUser);
  } catch (err) {
    res.status(400).send(err);
  }
};

const deleteUser = async (req: Request, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.params.id);
    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }
    
    const user1 = await userModel.findByIdAndDelete(userId);
    if (user1) {
      res.status(200).send("User deleted");
    }
  } catch (err) {
    res.status(400).send(err);
  }
};

export default {
  register,
  login,
  logout,
  refresh,
  updateUser,
  deleteUser,
  getAllUsers,
  getUserById,
  googleSignIn,
};
