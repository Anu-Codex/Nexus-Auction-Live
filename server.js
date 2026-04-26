require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const cors = require('cors');

const Player = require('.nexus-auction/models/Player');
const AuctionState = require('.nexus-auction/models/AuctionState');
const Team = require('./models/Team'); // <--- New Team Model

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/health', (req, res) => res.status(200).send('Alive'));

// Connect to MongoDB and Initialize Teams
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB');
        
        // Initialize teams with 200 Lakhs (2 Cr) if they don't exist
        const teamsCount = await Team.countDocuments();
        if (teamsCount === 0) {
            await Team.insertMany([
                { name: "FC Strikers", captainEmail: "team1@nexus.com", budget: 200 },
                { name: "United PES", captainEmail: "team2@nexus.com", budget: 200 },
                { name: "Galacticos", captainEmail: "team3@nexus.com", budget: 200 }
            ]);
            console.log('✅ Teams Initialized with 2 Cr Budget');
        }
    })
    .catch(err => console.error('❌ MongoDB Error:', err));

// --- API Routes for Initial Load ---
app.get('/api/data', async (req, res) => {
    const players = await Player.find();
    const teams = await Team.find();
    let state = await AuctionState.findOne().populate('activePlayerId');
    if (!state) state = await AuctionState.create({});
    res.json({ players, teams, state });
});

// --- Socket.io Logic ---
io.on('connection', (socket) => {
    console.log(`⚡ User connected: ${socket.id}`);

    // ADMIN: Add Player
    socket.on('addPlayer', async (playerData) => {
        await new Player(playerData).save();
        io.emit('updatePlayers', await Player.find());
    });

    // ADMIN: Start Auction
    socket.on('startAuction', async ({playerId, baseValue}) => {
        let state = await AuctionState.findOne();
        state.activePlayerId = playerId;
        state.currentBid = baseValue;
        state.highestBidder = null;
        await state.save();
        io.emit('updateAuction', await AuctionState.findOne().populate('activePlayerId'));
    });

    // CAPTAIN: Place Bid
    socket.on('placeBid', async ({ teamName, increment }) => {
        let state = await AuctionState.findOne();
        if (!state.activePlayerId) return;

        // Prevent bidding against yourself
        if (state.highestBidder === teamName) {
            return socket.emit('errorMsg', "You are already the highest bidder!");
        }

        // Check if Team has enough budget
        const team = await Team.findOne({ name: teamName });
        const newBidAmount = state.currentBid + increment;
        
        if (team.budget < newBidAmount) {
            return socket.emit('errorMsg', "Insufficient Budget!");
        }

        state.currentBid = newBidAmount;
        state.highestBidder = teamName;
        await state.save();
        io.emit('updateAuction', await AuctionState.findOne().populate('activePlayerId'));
    });

    // ADMIN: Sell Player & Deduct Budget Instantly
    socket.on('sellPlayer', async () => {
        let state = await AuctionState.findOne();
        if (!state.activePlayerId || !state.highestBidder) return;
        
        // 1. Deduct Budget
        const winningTeam = await Team.findOne({ name: state.highestBidder });
        if (winningTeam) {
            winningTeam.budget -= state.currentBid;
            await winningTeam.save();
        }

        // 2. Update Player Status
        await Player.findByIdAndUpdate(state.activePlayerId, {
            status: 'Sold',
            soldTo: `${state.highestBidder} (${state.currentBid}L)`
        });

        // 3. Reset Auction Dashboard
        state.activePlayerId = null;
        state.currentBid = 0;
        state.highestBidder = null;
        await state.save();

        // 4. Broadcast all updates to everyone instantly
        io.emit('updateTeams', await Team.find());
        io.emit('updatePlayers', await Player.find());
        io.emit('updateAuction', state);
    });

    socket.on('cancelAuction', async () => {
        let state = await AuctionState.findOne();
        state.activePlayerId = null;
        state.currentBid = 0;
        state.highestBidder = null;
        await state.save();
        io.emit('updateAuction', state);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
