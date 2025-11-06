'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function AuthErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const email = searchParams.get('email');

  const getErrorMessage = () => {
    switch (error) {
      case 'UserNotFound':
        return {
          title: 'Account Not Found',
          message: email 
            ? `No account exists for ${email}. Please contact your administrator to set up your account.`
            : 'No account found. Please contact your administrator to set up your account.',
          icon: '🔍',
        };
      case 'AccountInactive':
        return {
          title: 'Account Inactive',
          message: 'Your account has been deactivated. Please contact your administrator for assistance.',
          icon: '🔒',
        };
      case 'DatabaseError':
        return {
          title: 'Database Error',
          message: 'Unable to verify your account. Please try again or contact support.',
          icon: '⚠️',
        };
      case 'AccessDenied':
        return {
          title: 'Access Denied',
          message: 'You do not have permission to access this application.',
          icon: '🚫',
        };
      default:
        return {
          title: 'Authentication Error',
          message: 'An error occurred during sign in. Please try again.',
          icon: '❌',
        };
    }
  };

  const errorInfo = getErrorMessage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-xl p-8">
          {/* Icon */}
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">{errorInfo.icon}</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {errorInfo.title}
            </h1>
          </div>

          {/* Error Message */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800 text-center">
              {errorInfo.message}
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Link
              href="/auth/signin"
              className="block w-full text-center bg-blue-600 text-white rounded-lg px-6 py-3 font-medium hover:bg-blue-700 transition-colors"
            >
              Try Again
            </Link>

            {error === 'UserNotFound' && (
              <div className="text-center text-sm text-gray-600">
                <p className="mb-2">Need to request access?</p>
                <p className="font-medium">Contact: admin@encorelc.com</p>
              </div>
            )}
          </div>

          {/* Help Text */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center">
              If you continue to experience issues, please contact IT support
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthError() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    }>
      <AuthErrorContent />
    </Suspense>
  );
}
