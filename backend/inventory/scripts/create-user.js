require('dotenv').config({ quiet: true });
const authService = require('../services/authService');

const ROLES = ['manager', 'staff'];

async function main() {
  const [username, password, role] = process.argv.slice(2);

  if (!username || !password || !ROLES.includes(role)) {
    console.log('Usage: node scripts/create-user.js <username> <password> <manager|staff>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.log('The password must be at least 8 characters.');
    process.exit(1);
  }
  if (await authService.findUserByUsername(username)) {
    console.log(`User ${username} already exists.`);
    process.exit(1);
  }

  await authService.createUser({ username, password, role });
  console.log(`Created ${role} user: ${username}`);
}

main();