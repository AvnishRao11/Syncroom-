import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema({
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 40 },
    role: { type: String, enum: ['host', 'moderator', 'participant'], default: 'participant' },
    joinedAt: { type: Date, default: Date.now },
}, { _id: false });

const roomSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    hostId: { type: String, required: true },
    videoId: { type: String, default: '' },
    isPlaying: { type: Boolean, default: false },
    currentTime: { type: Number, default: 0 },
    participants: { type: [participantSchema], default: [] },
}, { timestamps: true });

export default mongoose.model('Room', roomSchema);