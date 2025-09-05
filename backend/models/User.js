/**
 * User data model and storage
 */

// Store user information (using Map for now, can be replaced with database later)
const users = new Map();

/**
 * User structure
 */
class User {
    constructor(id, userName, isHost) {
        this.id = id;
        this.userName = userName;
        this.isHost = isHost;
        this.joinedAt = new Date();
    }
}

/**
 * Get all users
 * @returns {Map} Users map
 */
function getUsers() {
    return users;
}

/**
 * Get user by ID
 * @param {string} id - User ID
 * @returns {User|undefined} User or undefined if not found
 */
function getUserById(id) {
    return users.get(id);
}

/**
 * Create or update user
 * @param {string} id - User ID
 * @param {string} userName - User name
 * @param {boolean} isHost - Whether user is host
 * @returns {User} Created or updated user
 */
function setUser(id, userName, isHost) {
    const user = new User(id, userName, isHost);
    users.set(id, user);
    return user;
}

/**
 * Remove user by ID
 * @param {string} id - User ID
 * @returns {boolean} True if user was removed, false if not found
 */
function removeUser(id) {
    return users.delete(id);
}

module.exports = {
    User,
    getUsers,
    getUserById,
    setUser,
    removeUser
};