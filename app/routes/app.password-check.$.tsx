import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Esta función verifica si una página está protegida
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop');
  const pageHandle = url.searchParams.get('page');
  
  if (!shop || !pageHandle) {
    return json({ protected: false });
  }

  try {
    const protectedPage = await prisma.protectedPage.findFirst({
      where: {
        shop: shop,
        handle: pageHandle
      }
    });

    if (protectedPage) {
      return json({ 
        protected: true,
        pageTitle: protectedPage.title,
        pageHandle: protectedPage.handle
      });
    }

    return json({ protected: false });
  } catch (error) {
    console.error('Error checking protected page:', error);
    return json({ protected: false });
  }
};

// Esta función valida la contraseña
export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const shop = formData.get('shop') as string;
  const pageHandle = formData.get('page') as string;
  const password = formData.get('password') as string;

  if (!shop || !pageHandle || !password) {
    return json({ success: false, message: 'Missing required fields' });
  }

  try {
    const protectedPage = await prisma.protectedPage.findFirst({
      where: {
        shop: shop,
        handle: pageHandle
      }
    });

    if (protectedPage && protectedPage.password === password) {
      return json({ 
        success: true, 
        message: 'Access granted',
        redirectUrl: `/pages/${pageHandle}`
      });
    }

    return json({ 
      success: false, 
      message: 'Invalid password'
    });
  } catch (error) {
    console.error('Error validating password:', error);
    return json({ 
      success: false, 
      message: 'Server error'
    });
  }
};