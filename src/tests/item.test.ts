import request from "supertest";
import mongoose from "mongoose";
import initApp from "../server";
import { Express } from "express";
import userModel from "../models/user_model";
import itemModel from "../models/item_model";

let app: Express;
let accessToken: string;
let refreshToken: string;
let userId: string;
let createdItemId: string;

beforeAll(async () => {
  app = await initApp();
  await userModel.deleteMany({});
  await itemModel.deleteMany({});

  // Register a test user
  const res = await request(app).post("/auth/register").send({
    email: "test@test.com",
    password: "1234567890",
    userName: "testuser",
  });
  expect(res.statusCode).toBe(200);

  // Login with the test user
  const loginRes = await request(app).post("/auth/login").send({
    email: "test@test.com",
    password: "1234567890",
  });
  expect(loginRes.statusCode).toBe(200);
  accessToken = loginRes.body.accessToken;
  refreshToken = loginRes.body.refreshToken;
  userId = loginRes.body._id;
});

afterAll(async () => {
  await userModel.deleteMany({});
  await itemModel.deleteMany({});
  await mongoose.connection.close();
});

describe("Item API Tests", () => {
  test("Should create a lost item", async () => {
    // Create a mock item directly without using the file upload
    const res = await request(app)
      .post("/items/upload-item")
      .set("Authorization", "Bearer " + accessToken)
      .send({
        userId: userId,
        imageUrl: "http://example.com/test.jpg", // Mock image URL
        itemType: "lost",
        description: "Test lost item",
        location: "Test location",
        category: "Test category",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.item).toBeDefined();
    expect(res.body.item.itemType).toBe("lost");
    expect(res.body.item.description).toBe("Test lost item");
    createdItemId = res.body.item._id;
  });

  test("Should get all items", async () => {
    const res = await request(app).get("/items");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test("Should get all lost items", async () => {
    const res = await request(app).get("/items?itemType=lost");
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].itemType).toBe("lost");
  });

  test("Should get items by user ID", async () => {
    const res = await request(app).get(`/items?userId=${userId}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].userId).toBe(userId);
  });

  test("Should get item by ID", async () => {
    const res = await request(app).get(`/items/${createdItemId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.item).toBeDefined();
    expect(res.body.item._id).toBe(createdItemId);
  });

  test("Should update an item", async () => {
    const res = await request(app)
      .put(`/items/${createdItemId}`)
      .set("Authorization", "Bearer " + accessToken)
      .send({
        userId: userId,
        description: "Updated description",
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.description).toBe("Updated description");
  });

  test("Should mark an item as resolved", async () => {
    const res = await request(app)
      .put(`/items/${createdItemId}/resolve`)
      .set("Authorization", "Bearer " + accessToken)
      .send({
        userId: userId,
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.isResolved).toBe(true);
  });

  test("Should create a found item", async () => {
    const res = await request(app)
      .post("/items/upload-item")
      .set("Authorization", "Bearer " + accessToken)
      .send({
        userId: userId,
        imageUrl: "http://example.com/test2.jpg", // Mock image URL
        itemType: "found",
        description: "Test found item",
        location: "Test location 2",
        category: "Test category",
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.item).toBeDefined();
    expect(res.body.item.itemType).toBe("found");
    expect(res.body.item.description).toBe("Test found item");
    
    // Store this new item ID for the delete test
    createdItemId = res.body.item._id;
  });

  test("Should delete an item", async () => {
    const res = await request(app)
      .delete(`/items/${createdItemId}`)
      .set("Authorization", "Bearer " + accessToken)
      .send({
        userId: userId,
      });

    expect(res.statusCode).toBe(200);
    
    // Verify the item is gone
    const getRes = await request(app).get(`/items/${createdItemId}`);
    expect(getRes.statusCode).toBe(404);
  });
}); 