const crypto = require('crypto');
const { PutCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const ddb = require('../db');

const USERS_TABLE = 'InventoryUsers';
const SESSIONS_TABLE = 'InventorySessions';
const KEY_LENGTH = 64;

// Turns a password into a hash with a random salt (Lab 8: crypto.scrypt)
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, KEY_LENGTH, (error, key) => {
      if (error) return reject(error);
      resolve({ salt, hash: key.toString('hex') });
    });
  });
}

// Hashes the typed password with the saved salt and compares it to the saved hash
function verifyPassword(password, salt, savedHash) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (error, key) => {
      if (error) return reject(error);
      const saved = Buffer.from(savedHash, 'hex');
      if (saved.length !== key.length) return resolve(false);
      resolve(crypto.timingSafeEqual(key, saved));
    });
  });
}

// Finds a user by username (the table key); returns it or undefined
async function findUserByUsername(username) {
  const result = await ddb.send(new GetCommand({ TableName: USERS_TABLE, Key: { username } }));
  return result.Item;
}

// Saves a new user; the password itself is never stored, only its hash
async function createUser({ username, password, role }) {
  const { salt, hash } = await hashPassword(password);
  await ddb.send(new PutCommand({
    TableName: USERS_TABLE,
    Item: {
      username,
      role,
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: new Date().toISOString()
    }
  }));
}

// Checks the username and password; returns { username, role } or null
async function checkLogin(username, password) {
  const user = await findUserByUsername(username);
  if (!user) {
    return null;
  }
  const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!ok) {
    return null;
  }
  return { username: user.username, role: user.role };
}

// Creates a session with a random token and returns the token
async function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  await ddb.send(new PutCommand({
    TableName: SESSIONS_TABLE,
    Item: { token, username, createdAt: new Date().toISOString() }
  }));
  return token;
}

// Finds who owns a token; returns { username, role } or null
async function findUserByToken(token) {
  const result = await ddb.send(new GetCommand({ TableName: SESSIONS_TABLE, Key: { token } }));
  if (!result.Item) {
    return null;
  }
  const user = await findUserByUsername(result.Item.username);
  if (!user) {
    return null;
  }
  return { username: user.username, role: user.role };
}

// Removes a session (logout)
async function deleteSession(token) {
  await ddb.send(new DeleteCommand({ TableName: SESSIONS_TABLE, Key: { token } }));
}

module.exports = {
  findUserByUsername,
  createUser,
  checkLogin,
  createSession,
  findUserByToken,
  deleteSession
};