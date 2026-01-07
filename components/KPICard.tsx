'use client';

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  bgColor?: string;
  size?: 'normal' | 'small';
  onClick?: () => void;
  isActive?: boolean;
  icon?: string; // Path to icon image
  // New props for Slack and unapproved alert
  showSlackButton?: boolean;
  onSlackClick?: () => void;
  unapprovedCount?: number;
  unapprovedAmount?: number;
  slackSending?: boolean;
}

export default function KPICard({ 
  title, 
  value, 
  subtitle, 
  trend, 
  bgColor = 'bg-white', 
  size = 'normal', 
  onClick, 
  isActive = false, 
  icon,
  showSlackButton = false,
  onSlackClick,
  unapprovedCount = 0,
  unapprovedAmount = 0,
  slackSending = false,
}: KPICardProps) {
  const isSmall = size === 'small';
  const hasUnapproved = unapprovedCount > 0;

  const handleSlackClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the card's onClick
    if (onSlackClick && !slackSending) {
      onSlackClick();
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };
  
  return (
    <div 
      className={`${bgColor} rounded-lg ${isActive ? 'border-2 border-green-500 shadow-2xl scale-105' : 'border border-gray-200 shadow-sm hover:shadow-lg hover:scale-105'} ${isSmall ? 'p-3' : 'p-6'} transition-all duration-200 cursor-pointer relative`}
      onClick={onClick}
      style={isActive ? {
        animation: 'pulse-glow 2s ease-in-out infinite'
      } : undefined}
    >
      {isActive && (
        <>
          <style jsx>{`
            @keyframes pulse-glow {
              0%, 100% {
                box-shadow: 0 0 20px rgba(34, 197, 94, 0.5), 0 10px 25px -5px rgba(0, 0, 0, 0.1);
              }
              50% {
                box-shadow: 0 0 30px rgba(34, 197, 94, 0.8), 0 10px 25px -5px rgba(0, 0, 0, 0.1);
              }
            }
          `}</style>
        </>
      )}

      {/* Unapproved Alert Badge */}
      {hasUnapproved && (
        <div 
          className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 shadow-md z-20"
          title={`${unapprovedCount} unapproved (${formatCurrency(unapprovedAmount)})`}
        >
          {unapprovedCount}
        </div>
      )}

      {/* Slack Button (Admin only) */}
      {showSlackButton && (
        <button
          onClick={handleSlackClick}
          disabled={slackSending}
          className={`absolute top-1 right-1 p-1.5 rounded-md transition-colors z-20 ${
            slackSending 
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
              : 'bg-purple-50 text-purple-600 hover:bg-purple-100 hover:text-purple-700'
          }`}
          title="Send summary to Slack"
        >
          {slackSending ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>
            </svg>
          )}
        </button>
      )}
      
      {/* Icon and Title Row */}
      <div className="flex items-center gap-2 mb-1">
        {icon && (
          <img 
            src={icon} 
            alt={title} 
            className={`${isSmall ? 'h-6 w-6' : 'h-8 w-8'} object-contain`}
          />
        )}
        <div className={`${isSmall ? 'text-xs' : 'text-sm'} font-medium ${isActive ? 'text-green-700 font-bold' : 'text-gray-600'} relative z-10 flex-1 ${showSlackButton ? 'pr-6' : ''}`}>
          {title}
        </div>
      </div>
      
      <div className={`${isSmall ? 'text-lg' : 'text-3xl'} font-bold text-gray-900 mb-1 relative z-10`}>{value}</div>
      {subtitle && (
        <div className={`${isSmall ? 'text-xs' : 'text-sm'} text-gray-500 relative z-10`}>{subtitle}</div>
      )}

      {/* Unapproved indicator text */}
      {hasUnapproved && (
        <div className={`${isSmall ? 'text-xs' : 'text-sm'} text-orange-600 font-medium mt-1 relative z-10`}>
          ⚠️ {unapprovedCount} unapproved
        </div>
      )}

      {trend && (
        <div className={`text-sm mt-2 ${trend.isPositive ? 'text-green-600' : 'text-red-600'} relative z-10`}>
          {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}% vs last quarter
        </div>
      )}
    </div>
  );
}