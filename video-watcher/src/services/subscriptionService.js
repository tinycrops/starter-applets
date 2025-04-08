import { loadStripe } from '@stripe/stripe-js';
import axios from 'axios';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

export const subscriptionService = {
  async createCheckoutSession(priceId) {
    try {
      const response = await axios.post('/api/create-checkout-session', {
        priceId,
      });
      const { sessionId } = response.data;
      
      const stripe = await stripePromise;
      const { error } = await stripe.redirectToCheckout({ sessionId });
      
      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  },

  async getSubscriptionStatus() {
    try {
      const response = await axios.get('/api/subscription-status');
      return response.data;
    } catch (error) {
      console.error('Error getting subscription status:', error);
      throw error;
    }
  },

  async cancelSubscription() {
    try {
      const response = await axios.post('/api/cancel-subscription');
      return response.data;
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw error;
    }
  }
}; 