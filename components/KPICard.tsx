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
}

export default function KPICard({ title, value, subtitle, trend, bgColor = 'bg-white', size = 'normal', onClick, isActive = false, icon }: KPICardProps) {
  const isSmall = size === 'small';
  
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
      
      {/* Icon and Title Row */}
      <div className="flex items-center gap-2 mb-1">
        {icon && (
          <img 
            src={icon} 
            alt={title} 
            className={`${isSmall ? 'h-6 w-6' : 'h-8 w-8'} object-contain`}
          />
        )}
        <div className={`${isSmall ? 'text-xs' : 'text-sm'} font-medium ${isActive ? 'text-green-700 font-bold' : 'text-gray-600'} relative z-10 flex-1`}>
          {title}
        </div>
      </div>
      
      <div className={`${isSmall ? 'text-lg' : 'text-3xl'} font-bold text-gray-900 mb-1 relative z-10`}>{value}</div>
      {subtitle && (
        <div className={`${isSmall ? 'text-xs' : 'text-sm'} text-gray-500 relative z-10`}>{subtitle}</div>
      )}
      {trend && (
        <div className={`text-sm mt-2 ${trend.isPositive ? 'text-green-600' : 'text-red-600'} relative z-10`}>
          {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}% vs last quarter
        </div>
      )}
    </div>
  );
}
