const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

require("dotenv").config();

const app = express();

/* ================= EMAIL CONFIG ================= */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});
/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://gtbit-it-lms.netlify.app",
    "https://idyllic-sunshine-a44fa9.netlify.app",
    "https://hilarious-banoffee-005913.netlify.app",
    "https://leavemanagementgtbit.netlify.app"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

/* ================= USER SCHEMA ================= */
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: String,
  designation: String,
  resetToken: String,
  resetTokenExpire: Date
});

const User = mongoose.model("User", UserSchema);

/* ================= DEFAULT HOD ================= */
const createDefaultHOD = async () => {
  try {
    const hashedPassword = await bcrypt.hash("Test12345", 10);

    const existingHOD = await User.findOne({
      email: "itgtbit@gmail.com"
    });

    if (existingHOD) {
      existingHOD.name = "HOD";
      existingHOD.role = "hod";
      existingHOD.designation = "Head of Department";
      existingHOD.password = hashedPassword;
      await existingHOD.save();
    } else {
      await User.create({
        name: "HOD",
        email: "itgtbit@gmail.com",
        password: hashedPassword,
        role: "hod",
        designation: "Head of Department"
      });
    }

    console.log("✅ HOD ready");
  } catch (err) {
    console.log("❌ HOD error:", err);
  }
};

/* ================= DB ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB Connected");
    await createDefaultHOD();
  })
  .catch(err => console.log("DB Error:", err));

/* ================= REGISTER ================= */
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role, designation } = req.body;

    const existing = await User.findOne({
      email: email.trim().toLowerCase()
    });

    if (existing)
      return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    await User.create({
      name,
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role,
      designation
    });

    res.json({ message: "Registered successfully" });
  } catch (err) {
    res.status(500).json({ error: "Register failed" });
  }
});

/* ================= LOGIN ================= */
app.post("/api/login", async (req, res) => {
  try {
    const email = req.body.email.trim().toLowerCase();
    const password = req.body.password;

    const user = await User.findOne({ email });

    if (!user)
      return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch)
      return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET
    );

    res.json({
      token,
      email: user.email,
      name: user.name,
      role: user.role,
      designation: user.designation
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= FORGOT PASSWORD ================= */
app.post("/api/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "Email address is required."
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.json({
        message:
          "If this email is registered, a reset link has been sent."
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");

    user.resetToken = resetToken;
    user.resetTokenExpire = Date.now() + 30 * 60 * 1000;

    await user.save();

  const resetLink =
  `https://hilarious-banoffee-005913.netlify.app/reset-password?token=${resetToken}`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: "GTBIT LMS Password Reset",
      text: `Reset your password:\n\n${resetLink}\n\nValid for 30 minutes.`
    });

    res.json({
      message: "Reset link sent if email exists."
    });

  } catch (err) {
    console.log("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({
      message: "Failed to process request"
    });
  }
});

/* ================= LEAVE APPLY ================= */
app.post("/api/leaves", async (req, res) => {
  try {
    const Leave = mongoose.model("Leave");

    const newLeave = new Leave(req.body);
    await newLeave.save();

    res.json(newLeave);

    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "itgtbit@gmail.com",
      subject: "New Leave Request",
      text: `New leave submitted`
    });

  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

/* ================= GET LEAVES ================= */
app.get("/api/leaves", async (req, res) => {
  try {
    const Leave = mongoose.model("Leave");
    const leaves = await Leave.find().lean();
    res.json(leaves);
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

/* ================= UPDATE LEAVE ================= */
app.put("/api/leaves/:id", async (req, res) => {
  try {
    const Leave = mongoose.model("Leave");

    const updated = await Leave.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: updated.user,
      subject: "Leave Status Updated",
      text: `Status: ${updated.status}`
    });

    res.json(updated);

  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});