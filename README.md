# Password Rotation Examples

This project provides deterministic automation flows for password rotation across various websites using [Anchor Browser](https://anchorbrowser.io). Each example demonstrates a reliable, repeatable script that can automatically change passwords on popular platforms. Built with [b0.dev](https://b0.dev/)

## 🚀 Quick Start

### 1. Install Dependencies

First, install the required npm packages:

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory and fill it with the actual credentials and configuration relevant to your task. The required environment variables vary by site:

#### Fandom

```env
ANCHOR_SESSION_ID=your-session-id  # Optional: reuse existing browser session
ANCHOR_FANDOM_BASE_URL=https://community.fandom.com
ANCHOR_FANDOM_USERNAME=your-username
ANCHOR_FANDOM_PASSWORD=your-current-password
ANCHOR_FANDOM_NEW_PASSWORD=your-new-password
```

#### PCPartPicker

```env
ANCHOR_SESSION_ID=your-session-id  # Optional
ANCHOR_PCPARTPICKER_USERNAME=your-username
ANCHOR_PCPARTPICKER_PASSWORD=your-current-password
ANCHOR_PCPARTPICKER_NEW_PASSWORD=your-new-password
```

#### Wikipedia

```env
ANCHOR_SESSION_ID=your-session-id  # Optional
ANCHOR_WIKIPEDIA_USERNAME=your-username
ANCHOR_WIKIPEDIA_PASSWORD=your-current-password
ANCHOR_WIKIPEDIA_NEW_PASSWORD=your-new-password
```

#### Zillow

```env
ANCHOR_SESSION_ID=your-session-id  # Optional
ANCHOR_ZILLOW_EMAIL=your-email
ANCHOR_ZILLOW_PASSWORD=your-current-password
ANCHOR_ZILLOW_NEW_PASSWORD=your-new-password
```

### 3. Run Examples

Execute the password rotation script for your desired platform:

```bash
npm run fandom
npm run pcpartpicker
npm run wikipedia
npm run zillow
```

## 🔒 Advanced Configuration: Stealth & Proxy

For certain use cases, especially when dealing with sites that have advanced bot detection or when you need to route traffic through specific locations, it's important to create your Anchor Browser session with additional stealth features and proxy configuration.

## 🏗️ Production Deployment with Anchor Browser Tasks

**Important:** The best way to develop, scale, and run these password rotation flows in production is to use the **Task feature** in Anchor Browser. This provides:

- ✅ Secure code sandbox execution
- ✅ Automatic browser management
- ✅ Version control for your automation scripts
- ✅ API-based invocation with custom inputs
- ✅ Scalable infrastructure

### Setting Up a Task

1. **Navigate to the Tasks Dashboard**  
   Go to [https://app.anchorbrowser.io/tasks](https://app.anchorbrowser.io/tasks)

2. **Create a New Task**  
   Click "Create New Task"

3. **Paste Your Code**  
   Copy the relevant password rotation code from the examples (e.g., `fandom.ts`, `wikipedia.ts`)

4. **Save a Version**  
   Save your task as a version to lock in the implementation

5. **Invoke with API**  
   Use the Anchor Browser API to run your task programmatically

### Running a Task via API

Once your task is created and saved, you can invoke it using the following curl command:

```bash
curl -X POST "https://api.anchorbrowser.io/v1/task/run/task-id" \
  --header 'anchor-api-key: <api-key>' \
  --header "Content-Type: application/json" \
  -d '{
    "inputs": {
      "ANCHOR_PARAM_1": "ANCHOR_PARAM_1_VALUE",
      "ANCHOR_PARAM_2": "ANCHOR_PARAM_2_VALUE"
    }
  }'
```

**Example for Fandom:**

```bash
curl -X POST "https://api.anchorbrowser.io/v1/task/run/your-fandom-task-id" \
  --header 'anchor-api-key: your-api-key' \
  --header "Content-Type: application/json" \
  -d '{
    "inputs": {
      "ANCHOR_FANDOM_USERNAME": "your-username",
      "ANCHOR_FANDOM_PASSWORD": "current-password",
      "ANCHOR_FANDOM_NEW_PASSWORD": "new-password"
    }
  }'
```

This approach allows you to:

- Run password rotations on a schedule
- Integrate with your automation pipeline
- Execute from any environment without managing dependencies
- Scale to hundreds or thousands of accounts

## 🔗 Links

- [Anchor Browser](https://anchorbrowser.io)
- [b0.dev](https://b0.dev/)
