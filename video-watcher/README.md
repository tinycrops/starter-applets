# Video Journaling App

A secure video journaling application that prioritizes user privacy while offering optional cloud features.

## Features

### Free Tier
- Local video storage
- Basic video organization
- Community support

### Premium Features
- Cloud backup (end-to-end encrypted)
- Cross-device sync
- AI-powered insights
- Priority support

## Privacy-First Approach

We believe in putting your privacy first:
- All videos are stored locally by default
- Cloud backup is optional and end-to-end encrypted
- You control which videos are synced to the cloud
- You can delete cloud backups at any time

## Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment file and update with your credentials:
   ```bash
   cp .env.example .env
   ```

4. Set up your Stripe account and add your API keys to the `.env` file

5. Start the development server:
   ```bash
   npm run dev
   ```

## Environment Variables

- `STRIPE_SECRET_KEY`: Your Stripe secret key
- `STRIPE_PUBLIC_KEY`: Your Stripe public key
- `JWT_SECRET`: Secret key for JWT authentication
- `FRONTEND_URL`: URL of your frontend application
- `BACKEND_URL`: URL of your backend server
- `ENCRYPTION_KEY`: Key used for video encryption

## Subscription Plans

### Basic Plan ($4.99/month)
- Local video storage
- Basic video organization
- Community support

### Premium Plan ($9.99/month)
- Everything in Basic
- Cloud backup (encrypted)
- Cross-device sync
- AI-powered insights
- Priority support

## Security

- All videos are stored locally by default
- Cloud backups are end-to-end encrypted
- User authentication using JWT
- Secure payment processing with Stripe

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 