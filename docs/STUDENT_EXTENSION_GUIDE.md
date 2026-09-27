# Kaveri Coding — Student Installation Guide

> **For Kaveri Technologies students:** This guide helps you install the Kaveri Coding extension in VS Code so you can receive assignments, write code, run tests, and submit your work — all from inside VS Code.

---

## Prerequisites

Before you start, make sure you have:

- **VS Code** installed → [Download here](https://code.visualstudio.com/download) (free)
- **Python 3** installed → [Download here](https://www.python.org/downloads/) (free)
- A **Google account** (the one you used to register on Kaveri Academy)

---

## Step 1: Download the Extension

1. Open your browser and go to:

   **[https://github.com/Narikparamala/kaveri-coding-workspace/releases/tag/v0.10.0](https://github.com/Narikparamala/kaveri-coding-workspace/releases/tag/v0.10.0)**

2. Under **Assets**, click on:

   **`kaveri-coding-0.10.0.vsix`**

3. Save the file to your Downloads folder (or anywhere you can find it).

---

## Step 2: Install the Extension in VS Code

1. Open **VS Code**

2. Press `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac) to open the **Command Palette**

3. Type: **`Extensions: Install from VSIX...`**

4. Press **Enter**

5. Navigate to the `kaveri-coding-0.10.0.vsix` file you downloaded and select it

6. VS Code will install the extension — you'll see a confirmation message

---

## Step 3: Sign In with Google

1. Look at the **left sidebar** (activity bar) — you'll see a new **graduation cap icon** (🎓) — that's Kaveri Coding

2. Click the **graduation cap icon**

3. In the Kaveri Coding sidebar, click **"Sign In with Google"**

4. A browser window will open — sign in with your **Google account** (use the same one you registered with on Kaveri Academy)

5. After signing in, the browser will redirect you back to VS Code

6. You should now see your name/email in the sidebar — you're signed in!

---

## Step 4: Join Your Batch

1. In the Kaveri Coding sidebar, click **"Join Batch"**

2. Enter the **batch code** your teacher gave you (for example: `PYTHON-2026-A`)

3. Click **Join**

4. You'll see your batch assignments appear in the sidebar

> **Don't know your batch code?** Ask your teacher or check the Kaveri Academy dashboard.

---

## Step 5: Open an Assignment

1. In the Kaveri Coding sidebar, you'll see a list of your assignments under **"My Assignments"**

2. Click on an assignment to open it

3. VS Code will create a folder on your computer with:
   - `question.md` — the problem statement
   - `main.py` — your starter code

4. The assignment folder opens automatically

---

## Step 6: Write Your Code

1. Open `main.py` in VS Code

2. Read the `question.md` file to understand the problem

3. Write your solution in `main.py`

4. Save the file (`Ctrl+S`)

---

## Step 7: Run Tests

1. In the Kaveri Coding sidebar, click the **🧪 Run Tests** button (or press `Ctrl+Shift+P` and type `Kaveri: Run Tests`)

2. Tests will run locally on your machine

3. You'll see which test cases pass and which fail

4. Fix any failing tests before submitting!

---

## Step 8: Submit Your Answer

1. Once your tests pass, click **"Submit Answer"** in the sidebar (or press `Ctrl+Shift+P` and type `Kaveri: Submit Answer`)

2. Your code is sent to the Kaveri server for grading

3. You'll see a confirmation message

4. The server runs additional hidden tests to verify your solution

---

## Step 9: Check Your Results

1. In the Kaveri Coding sidebar, click **"Refresh My Results"**

2. You'll see your score and which test cases passed

3. If you resubmit, your latest score is recorded

---

## Quick Reference

| Action | How to do it |
|---|---|
| **Open Kaveri sidebar** | Click the 🎓 icon in the left activity bar |
| **Sign In** | Click "Sign In with Google" in the sidebar |
| **Join Batch** | Click "Join Batch" → enter batch code |
| **Open Assignment** | Click any assignment in "My Assignments" |
| **Run Tests** | Click 🧪 "Run Tests" or `Ctrl+Shift+P` → `Kaveri: Run Tests` |
| **Submit Code** | Click "Submit Answer" or `Ctrl+Shift+P` → `Kaveri: Submit Answer` |
| **Check Results** | Click "Refresh My Results" |
| **Refresh Assignments** | Click "Refresh Assignments" or `Ctrl+Shift+P` → `Kaveri: Refresh Assignments` |

---

## Troubleshooting

### "Sign In" doesn't open a browser
- Make sure you have a default browser set in Windows Settings
- Try manually opening VS Code's built-in browser: `Ctrl+Shift+P` → `Simple Browser: Show`

### "Join Batch" says "Invalid batch code"
- Ask your teacher for the correct batch code
- Make sure you're signed in first

### Tests don't run
- Make sure Python 3 is installed and available in your PATH
- Check: open a terminal in VS Code (`Ctrl+``) and type `python --version`

### "Submit Answer" fails
- Make sure you're signed in (check the sidebar for your email)
- Make sure you have an internet connection
- Try refreshing assignments first

### Assignment folder didn't open
- The folder is created at: `C:\Users\<your-name>\Documents\Kaveri Coding\<Assignment Name>\`
- You can also click "Open Coding Folder" in the sidebar

---

## FAQ

**Q: Do I need to pay for the extension?**
A: No, the extension is free. Only some courses on Kaveri Academy require paid access.

**Q: Can I use the extension without being in a batch?**
A: No, you need to join a batch first to see assignments.

**Q: What programming languages are supported?**
A: Currently Python. More languages coming soon.

**Q: Can I submit multiple times?**
A: Yes, your latest submission is graded. You can resubmit as many times as you want.

**Q: Where is my code saved?**
A: On your computer at `C:\Users\<your-name>\Documents\Kaveri Coding\<Assignment Name>\`

**Q: How do I update the extension?**
A: Download the new `.vsix` file from the GitHub releases page and install it the same way.

---

## Need Help?

- **Teacher:** Ask your teacher for batch codes and assignment help
- **Email:** support@kaveritech.co.in
- **Website:** [https://kaveri-academy.vercel.app](https://kaveri-academy.vercel.app)

---

*Kaveri Technologies — Empowering students through technology*
