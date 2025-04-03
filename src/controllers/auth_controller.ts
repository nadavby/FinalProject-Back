/* eslint-disable @typescript-eslint/no-explicit-any */
/** @format */

import { NextFunction, Request, Response } from "express";
import userModel from "../models/user_model";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { OAuth2Client } from "google-auth-library";

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
  const random = Math.floor(Math.random() * 1000000);
  const accessToken = jwt.sign(
    { _id: _id, random: random },
    process.env.TOKEN_SECRET,
    { expiresIn: process.env.TOKEN_EXPIRATION }
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
    res.status(402).send("Unauthorized");
    return;
  }
  const token = authorization && authorization.split(" ")[1];
  if (!token) {
    res.status(403).send("Unauthorized");
    return;
  }
  if (!process.env.TOKEN_SECRET) {
    res.status(500).send("server error");
    return;
  }
  jwt.verify(token, process.env.TOKEN_SECRET, (err, payload) => {
    if (err) {
      res.status(401).send("Unauthorized");
      return;
    }
    req.params.userId = (payload as Payload)._id;
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
      const oldUserName = user.userName;
      const newUserName = req.body.userName;

      const existingUser = await userModel.findOne({ userName: newUserName });
      if (existingUser) {
        return res.status(400).send("User name already exists");
      }

      await postModel.updateMany(
        { owner: oldUserName },
        { owner: newUserName }
      );

      await commentModel.updateMany(
        { owner: oldUserName },
        { owner: newUserName }
      );

      await postModel.updateMany(
        { "comments.owner": oldUserName },
        { $set: { "comments.$[elem].owner": newUserName } },
        { arrayFilters: [{ "elem.owner": oldUserName }], multi: true }
      );
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
    await postModel.deleteMany({ owner: user.userName });
    await commentModel.deleteMany({ owner: user.userName });
    await postModel.updateMany(
      {},
      { $pull: { comments: { owner: user.userName } } }
    );
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
