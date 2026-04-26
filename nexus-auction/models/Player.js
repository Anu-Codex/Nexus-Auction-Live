const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    strength: { type: Number, required: true },
    cardType: { type: String, required: true },
    value: { type: Number, required: true },
    status: { type: String, default: 'Available' }, // 'Available' or 'Sold'
    soldTo: { type: String, default: '-' }
});

module.exports = mongoose.model('Player', playerSchema);
