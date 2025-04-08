import { create } from 'zustand';
import { subscriptionService } from '../services/subscriptionService';

export const useSubscriptionStore = create((set) => ({
  subscriptionStatus: null,
  isLoading: false,
  error: null,

  checkSubscriptionStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const status = await subscriptionService.getSubscriptionStatus();
      set({ subscriptionStatus: status, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
    }
  },

  subscribe: async (priceId) => {
    set({ isLoading: true, error: null });
    try {
      await subscriptionService.createCheckoutSession(priceId);
      set({ isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
    }
  },

  cancelSubscription: async () => {
    set({ isLoading: true, error: null });
    try {
      await subscriptionService.cancelSubscription();
      set({ subscriptionStatus: null, isLoading: false });
    } catch (error) {
      set({ error: error.message, isLoading: false });
    }
  }
})); 