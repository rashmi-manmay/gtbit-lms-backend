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
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://gtbit-it-lms.netlify.app",
    "https://idyllic-sunshine-a44fa9.netlify.app"
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
    const existingHOD = await User.findOne({ role: "hod" });

    if (!existingHOD) {
      const hashedPassword = await bcrypt.hash("hod123", 10);

      await User.create({
        name: "HOD",
        email: "itgtbit@gmail.com",
        password: hashedPassword,
        role: "hod",
        designation: "Head of Department"
      });

      console.log("✅ Default HOD created");
    } else {
      console.log("ℹ️ HOD already exists");
    }

  } catch (err) {
    console.log("❌ HOD creation error:", err);
  }
};

/* ================= DB ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB Connected");
    await createDefaultHOD();
  })
  .catch(err => console.log("DB Error:", err));

/* ================= LEAVE SCHEMA ================= */
const LeaveSchema = new mongoose.Schema({
  user: String,
  userEmail: String,
  name: String,
  designation: String,
  leaveFrom: String,
  leaveTo: String,
  reason: String,
  leaveType: String,
  otherLeaveType: String,
  adjustments: String,
  dayType: String,
  halfType: String,
  status: { type: String, default: "Pending" },
  rejectReason: String,
  notification: String
});

const Leave = mongoose.model("Leave", LeaveSchema);

/* ================= REGISTER ================= */
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password, role, designation } = req.body;

    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role,
      designation
    });

    await user.save();

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

    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid password" });

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

/* ================= LEAVE APPLY ================= */
/* ================= LEAVE APPLY ================= */
/* ================= LEAVE APPLY ================= */
app.post("/api/leaves", async (req, res) => {
  try {
    const data = req.body.formData
      ? {
          ...req.body.formData,
          user: req.body.userEmail,
          userEmail: req.body.userEmail,
          status: req.body.status || "Pending"
        }
      : {
          ...req.body,
          user: req.body.user || req.body.userEmail,
          userEmail: req.body.userEmail || req.body.user
        };

    const newLeave = new Leave(data);
    await newLeave.save();

    // Respond immediately after saving
    res.json(newLeave);

    // Send email separately
    transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "hoditgtbit@gmail.com",
      subject: "New Leave Request",
      text: `
New Leave Request

Name: ${data.name}
Designation: ${data.designation}
From: ${data.leaveFrom}
To: ${data.leaveTo}
Reason: ${data.reason}
Leave Type: ${data.leaveType}
Adjustment: ${data.adjustments}
Day Type: ${data.dayType || "-"}
Half Type: ${data.halfType || "-"}
      `
    })
    .then(() => console.log("✅ Leave email sent to HOD"))
    .catch(err => console.log("⚠️ Leave email failed:", err.message));

  } catch (err) {
    console.log("LEAVE APPLY ERROR:", err);
    res.status(500).json({ error: "Failed to save leave" });
  }
});

/* ================= GET LEAVES ================= */
app.get("/api/leaves", async (req, res) => {
  try {
    const leaves = await Leave.find().lean();

    const formattedLeaves = leaves.map(leave => ({
      ...leave,
      userEmail: leave.userEmail || leave.user
    }));

    res.json(formattedLeaves);

  } catch (err) {
    console.log("GET LEAVES ERROR:", err);
    res.status(500).json({ error: "Failed to fetch leaves" });
  }
});
/* ================= UPDATE LEAVE ================= */
app.put("/api/leaves/:id", async (req, res) => {
  try {
    const { status, rejectReason } = req.body;

    let updateData = { status };

    if (status === "Rejected") {
      updateData.rejectReason = rejectReason;
      updateData.notification = `❌ Your leave is rejected: ${rejectReason}`;
    }

    if (status === "Approved") {
      updateData.notification = "✅ Your leave is approved";
    }

    const updated = await Leave.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    // ✅ THIS MUST BE INSIDE THE SAME async FUNCTION
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: updated.user, // or updated.email if you fix schema
      subject: `Leave ${updated.status}`,
      text: `
Your leave request is ${updated.status}

From: ${updated.leaveFrom}
To: ${updated.leaveTo}

${updated.status === "Rejected" ? "Reason: " + updated.rejectReason : ""}
      `
    });

    res.json(updated);

  } catch (err) {
    console.log("UPDATE ERROR:", err);
    res.status(500).json({ error: "Update failed" });
  }
});
/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});