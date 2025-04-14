/** @format */

// Augment the Express namespace to add userId to the Request interface
declare namespace Express {
  export interface Request {
    userId?: string;
  }
} 