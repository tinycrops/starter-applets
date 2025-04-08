import React, { useEffect } from 'react';
import { useSubscriptionStore } from '../store/subscriptionStore';

const PRICING_TIERS = [
  {
    id: 'price_basic',
    name: 'Basic',
    price: '$4.99',
    features: [
      'Local video storage',
      'Basic video organization',
      'Community support'
    ]
  },
  {
    id: 'price_premium',
    name: 'Premium',
    price: '$9.99',
    features: [
      'Everything in Basic',
      'Cloud backup (encrypted)',
      'Cross-device sync',
      'AI-powered insights',
      'Priority support'
    ]
  }
];

export const SubscriptionManager = () => {
  const { subscriptionStatus, isLoading, error, checkSubscriptionStatus, subscribe, cancelSubscription } = useSubscriptionStore();

  useEffect(() => {
    checkSubscriptionStatus();
  }, []);

  if (isLoading) {
    return <div className="loading">Loading subscription status...</div>;
  }

  if (error) {
    return <div className="error">Error: {error}</div>;
  }

  return (
    <div className="subscription-manager">
      <h2>Choose Your Plan</h2>
      <div className="pricing-tiers">
        {PRICING_TIERS.map((tier) => (
          <div key={tier.id} className="pricing-tier">
            <h3>{tier.name}</h3>
            <div className="price">{tier.price}/month</div>
            <ul className="features">
              {tier.features.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
            {subscriptionStatus?.active ? (
              subscriptionStatus.planId === tier.id ? (
                <button 
                  className="cancel-button"
                  onClick={cancelSubscription}
                  disabled={isLoading}
                >
                  Cancel Subscription
                </button>
              ) : (
                <button 
                  className="upgrade-button"
                  onClick={() => subscribe(tier.id)}
                  disabled={isLoading}
                >
                  Upgrade
                </button>
              )
            ) : (
              <button 
                className="subscribe-button"
                onClick={() => subscribe(tier.id)}
                disabled={isLoading}
              >
                Subscribe
              </button>
            )}
          </div>
        ))}
      </div>
      
      {subscriptionStatus?.active && (
        <div className="current-plan">
          <h3>Your Current Plan</h3>
          <p>You are subscribed to the {subscriptionStatus.planName} plan.</p>
          <p>Next billing date: {new Date(subscriptionStatus.currentPeriodEnd).toLocaleDateString()}</p>
        </div>
      )}
    </div>
  );
}; 