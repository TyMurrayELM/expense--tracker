import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST() {
  try {
    // Check if user is authenticated and is admin
    const session = await getServerSession(authOptions);
    
    if (!session || !session.user?.email) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user is admin
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('is_admin')
      .eq('email', session.user.email.toLowerCase())
      .single();

    if (!user || !user.is_admin) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    console.log('=== Auto-Create Users from Purchasers Started ===');

    // Get all unique cardholders from expenses
    const { data: purchasers, error: purchaserError } = await supabaseAdmin
      .from('expenses')
      .select('cardholder')
      .not('cardholder', 'is', null);

    if (purchaserError) {
      throw new Error(`Failed to fetch purchasers: ${purchaserError.message}`);
    }

    // Get unique purchaser names
    const uniquePurchasers = [...new Set(purchasers.map(p => p.cardholder))].filter(Boolean);
    console.log(`Found ${uniquePurchasers.length} unique purchasers`);

    // Get existing users to avoid duplicates
    const { data: existingUsers, error: usersError } = await supabaseAdmin
      .from('users')
      .select('email, full_name');

    if (usersError) {
      throw new Error(`Failed to fetch existing users: ${usersError.message}`);
    }

    const existingEmails = new Set(existingUsers.map(u => u.email.toLowerCase()));
    const existingNames = new Set(existingUsers.map(u => u.full_name.toLowerCase()));

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    const createdUsers: any[] = [];

    // Helper function to convert name to email
    const nameToEmail = (name: string): string => {
      // Remove any extra spaces and convert to lowercase
      const cleaned = name.trim().toLowerCase();
      
      // Replace spaces with dots for first.last format
      const emailPrefix = cleaned.replace(/\s+/g, '.');
      
      return `${emailPrefix}@encorelm.com`;
    };

    // Process each purchaser
    for (const purchaser of uniquePurchasers) {
      try {
        const email = nameToEmail(purchaser);
        
        // Skip if email already exists
        if (existingEmails.has(email)) {
          skipped++;
          console.log(`Skipped (email exists): ${purchaser} (${email})`);
          continue;
        }

        // Skip if name already exists (even with different email)
        if (existingNames.has(purchaser.toLowerCase())) {
          skipped++;
          console.log(`Skipped (name exists): ${purchaser}`);
          continue;
        }

        // Create the user
        const { data: newUser, error: createError } = await supabaseAdmin
          .from('users')
          .insert({
            email: email,
            full_name: purchaser,
            is_admin: false,
            is_active: true,
          })
          .select()
          .single();

        if (createError) {
          errors.push(`Failed to create ${purchaser}: ${createError.message}`);
          console.error(`Error creating user ${purchaser}:`, createError);
        } else {
          created++;
          createdUsers.push({
            name: purchaser,
            email: email,
            id: newUser.id,
          });
          console.log(`Created user: ${purchaser} (${email})`);
        }
      } catch (error: any) {
        errors.push(`Exception creating ${purchaser}: ${error.message}`);
        console.error(`Exception for ${purchaser}:`, error);
      }
    }

    console.log('=== Auto-Create Users Completed ===');
    console.log(`Created: ${created}, Skipped: ${skipped}, Errors: ${errors.length}`);

    return NextResponse.json({
      success: true,
      message: `Created ${created} users from purchasers`,
      stats: {
        totalPurchasers: uniquePurchasers.length,
        created,
        skipped,
        errorCount: errors.length,
      },
      createdUsers,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Error auto-creating users:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to auto-create users',
      },
      { status: 500 }
    );
  }
}
