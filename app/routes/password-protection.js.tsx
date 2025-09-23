import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  DataTable,
  Badge,
  Banner,
  Divider,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  
  // Obtener páginas existentes
  const response = await admin.graphql(`
    query getPages {
      pages(first: 50) {
        edges {
          node {
            id
            title
            handle
            createdAt
            updatedAt
          }
        }
      }
    }
  `);
  
  const responseJson = await response.json();
  const pages = responseJson.data?.pages?.edges || [];
  
  // Obtener páginas protegidas desde la base de datos
  const protectedPages = await prisma.protectedPage.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });
  
  // Verificar si el script tag ya existe
  const scriptTagResponse = await admin.graphql(`
    query getScriptTags {
      scriptTags(first: 10) {
        edges {
          node {
            id
            src
          }
        }
      }
    }
  `);
  
  const scriptTagData = await scriptTagResponse.json();
  const existingScripts = scriptTagData.data?.scriptTags?.edges || [];
  const hasPasswordScript = existingScripts.some(edge => 
    edge.node.src?.includes('password-protection.js')
  );
  
  return { pages, protectedPages, hasPasswordScript };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  
  if (action === "protect_page") {
    const pageId = formData.get("pageId") as string;
    const password = formData.get("password") as string;
    
    // Obtener información de la página desde Shopify
    const pageResponse = await admin.graphql(`
      query getPage($id: ID!) {
        page(id: $id) {
          id
          title
          handle
        }
      }
    `, {
      variables: { id: pageId }
    });
    
    const pageData = await pageResponse.json();
    const page = pageData.data?.page;
    
    if (!page) {
      return { success: false, message: "Page not found" };
    }
    
    // Guardar página protegida en la base de datos
    try {
      await prisma.protectedPage.create({
        data: {
          pageId: page.id,
          title: page.title,
          handle: page.handle,
          password: password, // En producción, esto debería estar encriptado
          shop: session.shop,
        }
      });
      
      return { 
        success: true, 
        message: `Page "${page.title}" is now protected`
      };
    } catch (error) {
      console.error('Error protecting page:', error);
      return { success: false, message: "Failed to protect page" };
    }
  }
  
  if (action === "install_script") {
    try {
      const scriptTagResponse = await admin.graphql(`
        mutation scriptTagCreate($scriptTag: ScriptTagInput!) {
          scriptTagCreate(scriptTag: $scriptTag) {
            scriptTag {
              id
              src
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          scriptTag: {
            src: `https://cologne-post-life-grid.trycloudflare.com/password-protection.js`
          }
        }
      });
      
      const scriptTagData = await scriptTagResponse.json();
      
      if (scriptTagData.data?.scriptTagCreate?.userErrors?.length > 0) {
        return { 
          success: false, 
          message: `Script installation failed: ${scriptTagData.data.scriptTagCreate.userErrors[0].message}`
        };
      }
      
      return { 
        success: true, 
        message: "Password protection script installed successfully"
      };
    } catch (error) {
      console.error('Error installing script:', error);
      return { success: false, message: "Failed to install protection script" };
    }
  }
  
  if (action === "remove_protection") {
    const pageId = formData.get("pageId") as string;
    
    try {
      await prisma.protectedPage.deleteMany({
        where: {
          pageId: pageId,
          shop: session.shop
        }
      });
      
      return { success: true, message: "Page protection removed" };
    } catch (error) {
      console.error('Error removing protection:', error);
      return { success: false, message: "Failed to remove protection" };
    }
  }
  
  return { success: false, message: "Invalid action" };
};

export default function Index() {
  const { pages, protectedPages, hasPasswordScript } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  
  const [selectedPage, setSelectedPage] = useState("");
  const [password, setPassword] = useState("");
  
  const isLoading = ["loading", "submitting"].includes(fetcher.state);
  
  useEffect(() => {
    if (fetcher.data?.success) {
      shopify.toast.show(fetcher.data.message);
      // Limpiar formulario
      setPassword("");
      setSelectedPage("");
    } else if (fetcher.data?.success === false) {
      shopify.toast.show(fetcher.data.message, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleProtectPage = () => {
    if (!selectedPage || !password) {
      shopify.toast.show("Please select a page and enter a password", { isError: true });
      return;
    }
    
    // Verificar si la página ya está protegida
    const alreadyProtected = protectedPages.some(page => page.pageId === selectedPage);
    if (alreadyProtected) {
      shopify.toast.show("This page is already protected", { isError: true });
      return;
    }
    
    const formData = new FormData();
    formData.append("action", "protect_page");
    formData.append("pageId", selectedPage);
    formData.append("password", password);
    
    fetcher.submit(formData, { method: "POST" });
  };

  const handleInstallScript = () => {
    const formData = new FormData();
    formData.append("action", "install_script");
    fetcher.submit(formData, { method: "POST" });
  };

  const handleRemoveProtection = (pageId: string) => {
    const formData = new FormData();
    formData.append("action", "remove_protection");
    formData.append("pageId", pageId);
    
    fetcher.submit(formData, { method: "POST" });
  };

  const pageOptions = pages
    .filter(edge => !protectedPages.some(protectedPage => protectedPage.pageId === edge.node.id))
    .map((edge: any) => ({
      label: edge.node.title,
      value: edge.node.id,
    }));

  const tableRows = protectedPages.map((page) => [
    page.title,
    page.handle,
    <Badge tone="success">Protected</Badge>,
    new Date(page.createdAt).toLocaleDateString(),
    <Button 
      variant="plain" 
      tone="critical"
      onClick={() => handleRemoveProtection(page.pageId)}
    >
      Remove Protection
    </Button>
  ]);

  return (
    <Page>
      <TitleBar title="Password Protected Pages" />

      <BlockStack gap="500">
        {!hasPasswordScript && (
          <Banner
            title="Setup Required"
            tone="warning"
            action={{
              content: "Install Protection Script",
              onAction: handleInstallScript,
              loading: isLoading
            }}
          >
            <p>To protect pages on your storefront, you need to install the password protection script. This will enable the password forms to appear when visitors try to access protected pages.</p>
          </Banner>
        )}
        
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Protect a New Page
                </Text>
                
                <InlineStack gap="400" align="end">
                  <div style={{ flex: 1 }}>
                    <Select
                      label="Select Page to Protect"
                      options={[
                        { label: "Choose a page", value: "" },
                        ...pageOptions,
                      ]}
                      value={selectedPage}
                      onChange={setSelectedPage}
                      disabled={pageOptions.length === 0}
                    />
                  </div>
                  
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Password"
                      type="password"
                      value={password}
                      onChange={setPassword}
                      placeholder="Enter a strong password"
                      autoComplete="off"
                    />
                  </div>
                  
                  <Button
                    variant="primary"
                    loading={isLoading}
                    onClick={handleProtectPage}
                    disabled={!selectedPage || !password}
                  >
                    Protect Page
                  </Button>
                </InlineStack>
                
                {pageOptions.length === 0 && pages.length > 0 && (
                  <Banner tone="info">
                    All available pages are already protected.
                  </Banner>
                )}
                
                {pages.length === 0 && (
                  <Banner tone="warning">
                    <p>No pages found in your store. <Button url="shopify:admin/pages" target="_blank" variant="plain">Create some pages</Button> to start protecting them.</p>
                  </Banner>
                )}
              </BlockStack>
            </Card>
            
            <Divider />
            
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Currently Protected Pages ({protectedPages.length})
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Total pages in store: {pages.length}
                  </Text>
                </InlineStack>
                
                {protectedPages.length === 0 ? (
                  <Banner tone="info">
                    <p>No pages are currently protected. Use the form above to protect your first page.</p>
                  </Banner>
                ) : (
                  <DataTable
                    columnContentTypes={['text', 'text', 'text', 'text', 'text']}
                    headings={['Page Title', 'Handle', 'Status', 'Protected Date', 'Actions']}
                    rows={tableRows}
                  />
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    How it works
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Select any page from your store's main navigation and set a custom password. Visitors will need to enter the correct password to access the protected content.
                  </Text>
                </BlockStack>
              </Card>
              
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Features
                  </Text>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">
                      ✓ Custom password per page
                    </Text>
                    <Text as="p" variant="bodyMd">
                      ✓ Works with existing pages
                    </Text>
                    <Text as="p" variant="bodyMd">
                      ✓ Easy to manage
                    </Text>
                    <Text as="p" variant="bodyMd">
                      ✓ Mobile responsive
                    </Text>
                    <Text as="p" variant="bodyMd">
                      ✓ No theme modifications needed
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>
              
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Quick Stats
                  </Text>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">Available to Protect</Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {pageOptions.length}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodyMd">Currently Protected</Text>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {protectedPages.length}
                    </Text>
                  </InlineStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}