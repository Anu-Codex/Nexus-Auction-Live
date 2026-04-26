const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
    name: { type: String, required: true },
    captainEmail: { type: String, required: true },
    budget: { type: Number, default: 200 } // Budget in Lakhs (200L = 2 Cr)
});

module.exports = mongoose.model('Team', teamSchema);
