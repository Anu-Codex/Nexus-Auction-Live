const mongoose = require('mongoose');

const auctionStateSchema = new mongoose.Schema({
    activePlayerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
    currentBid: { type: Number, default: 0 },
    highestBidder: { type: String, default: null }
});

module.exports = mongoose.model('AuctionState', auctionStateSchema);
