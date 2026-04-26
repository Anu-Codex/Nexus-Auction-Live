require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const cors = require('cors');

const Player = require('./models/Player');
const AuctionState = require('./models/AuctionState');

const app = express();
const server = http.createServer(app);

// Allow frontend to connect without CORS issues
const io = new Server(server, { 
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"] 
    } 
});

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serves your frontend

// 🟢 HEALTH CHECK FOR RENDER
// Render pings this to make sure your app didn't crash
app.get('/health', (req, res) => {
    res.status(200).send('Server is alive');
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Initial Load Routes
app.get('/api/players', async (req, res) => {
    const players = await Player.find();
    res.json(players);
});

app.get('/api/auction', async (req, res) => {
    let state = await AuctionState.findOne().populate('activePlayerId');
    if (!state) state = await AuctionState.create({});
    res.json(state);
});

// Socket.io Real-Time Logic
io.on('connection', (socket) => {
    console.log(`⚡ User connected: ${socket.id}`);

    socket.on('addPlayer', async (playerData) => {
        const newPlayer = new Player(playerData);
        await newPlayer.save();
        io.emit('updatePlayers', await Player.find());
    });

    socket.on('startAuction', async ({playerId, baseValue}) => {
        let state = await AuctionState.findOne();
        state.activePlayerId = playerId;
        state.currentBid = baseValue;
        state.highestBidder = null;
        await state.save();
        const populatedState = await AuctionState.findOne().populate('activePlayerId');
        io.emit('updateAuction', populatedState);
    });

    socket.on('placeBid', async ({ teamName, increment }) => {
        let state = await AuctionState.findOne();
        if (!state.activePlayerId) return;
        state.currentBid += increment;
        state.highestBidder = teamName;
        await state.save();
        const populatedState = await AuctionState.findOne().populate('activePlayerId');
        io.emit('updateAuction', populatedState);
    });

    socket.on('sellPlayer', async () => {
        let state = await AuctionState.findOne();
        if (!state.activePlayerId || !state.highestBidder) return;
        
        await Player.findByIdAndUpdate(state.activePlayerId, {
            status: 'Sold',
            soldTo: `${state.highestBidder} (${state.currentBid}M)`
        });

        state.activePlayerId = null;
        state.currentBid = 0;
        state.highestBidder = null;
        await state.save();

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

// IMPORTANT FOR RENDER: Must use process.env.PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
