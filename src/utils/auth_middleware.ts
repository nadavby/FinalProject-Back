/** @format */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import userModel from '../models/user_model';

type Payload = {
  _id: string;
};

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const authorization = req.header('authorization');
  if (!authorization) {
    console.error('Auth error: Missing authorization header');
    res.status(401).json({ success: false, error: 'Unauthorized - Missing authorization header' });
    return;
  }

  const parts = authorization.split(' ');
  if (parts.length !== 2) {
    console.error('Auth error: Invalid authorization format', authorization);
    res.status(401).json({
      success: false,
      error: 'Unauthorized - Invalid authorization format. Expected "Bearer [token]" or "JWT [token]"'
    });
    return;
  }

  const prefix = parts[0];
  const token = parts[1];

  if (prefix !== 'Bearer' && prefix !== 'JWT') {
    console.error(`Auth error: Invalid token prefix "${prefix}"`, authorization);
    res.status(401).json({
      success: false,
      error: 'Unauthorized - Invalid token prefix. Expected "Bearer" or "JWT"'
    });
    return;
  }

  if (!token) {
    console.error('Auth error: Empty token');
    res.status(401).json({ success: false, error: 'Unauthorized - Empty token' });
    return;
  }

  if (!process.env.TOKEN_SECRET) {
    console.error('Auth error: TOKEN_SECRET not set in environment');
    res.status(500).json({ success: false, error: 'Server configuration error - TOKEN_SECRET not set' });
    return;
  }

  const refreshToken = req.header('refresh-token');

  jwt.verify(token, process.env.TOKEN_SECRET, async (err, payload) => {
    if (err && err.name === 'TokenExpiredError' && refreshToken) {
      console.log('Token expired, attempting refresh with provided refresh token');
      try {
        const refreshPayload = jwt.verify(refreshToken, process.env.TOKEN_SECRET!);
        if (!refreshPayload || typeof refreshPayload !== 'object' || !('_id' in refreshPayload)) {
          console.error('Invalid refresh token payload structure');
          return res.status(401).json({ success: false, error: 'Unauthorized - Invalid refresh token' });
        }

        const user = await userModel.findOne({
          _id: (refreshPayload as Payload)._id,
        });
        if (!user) {
          console.error('User not found for refresh token');
          return res.status(401).json({ success: false, error: 'Unauthorized - Invalid refresh token' });
        }

        if (!user.refreshToken || !user.refreshToken.includes(refreshToken)) {
          console.error('Refresh token not found in user\'s refresh tokens');
          return res.status(401).json({ success: false, error: 'Unauthorized - Invalid refresh token' });
        }

        const tokens = generateToken(user._id);
        if (!tokens) {
          console.error('Failed to generate new tokens');
          return res.status(500).json({ success: false, error: 'Server error - Failed to generate new tokens' });
        }

        user.refreshToken = user.refreshToken.filter((t) => t !== refreshToken);
        user.refreshToken.push(tokens.refreshToken);
        await user.save();

        res.setHeader('new-access-token', tokens.accessToken);
        res.setHeader('new-refresh-token', tokens.refreshToken);

        req.body.userId = user._id.toString();
        console.log(`User authenticated via token refresh: ${req.body.userId}`);
        return next();
      } catch (refreshErr) {
        console.error('Error refreshing token:', refreshErr);
        return res.status(401).json({ success: false, error: 'Unauthorized - Invalid or expired refresh token' });
      }
    }

    if (err) {
      console.error('Auth error: Token verification failed', err);
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ success: false, error: 'Unauthorized - Token expired' });
      } else if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ success: false, error: 'Unauthorized - Invalid token' });
      } else {
        return res.status(401).json({ success: false, error: `Unauthorized - ${err.message}` });
      }
    }

    if (!payload || typeof payload !== 'object' || !('_id' in payload)) {
      console.error('Auth error: Invalid payload structure', payload);
      return res.status(401).json({ success: false, error: 'Unauthorized - Invalid token payload' });
    }

    req.body.userId = (payload as Payload)._id;
    console.log(`User authenticated: ${req.body.userId}`);
    next();
  });
};

const generateToken = (
  _id: string
): { accessToken: string; refreshToken: string } | null => {
  if (!process.env.TOKEN_SECRET || !process.env.TOKEN_EXPIRATION) {
    return null;
  }

  console.log('Generating new token with expiration:', process.env.TOKEN_EXPIRATION);

  const random = Math.floor(Math.random() * 1000000);
  const accessToken = jwt.sign({ _id: _id, random: random }, process.env.TOKEN_SECRET, {
    expiresIn: '24h', // Override with 24 hours for testing
  });
  const refreshToken = jwt.sign({ _id: _id, random: random }, process.env.TOKEN_SECRET, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRATION,
  });
  return { accessToken, refreshToken };
}; 