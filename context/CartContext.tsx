"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";

type CartItem = {
  id: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  stock: number;
  image_url?: string;
};

type CartContextType = {
  items: CartItem[];
  addItem: (product: any) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  total: number;
  itemCount: number;
  loading: boolean;
  refreshCart: () => Promise<void>;
  userId: string | null;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();
  const router = useRouter();

  // Get current user
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    getUser();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUserId(session?.user?.id || null);
        if (!session?.user) {
          setItems([]);
        }
      },
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  // Fetch cart from database when user changes
  useEffect(() => {
    if (userId) {
      fetchCart(true);
    } else {
      setItems([]);
      setLoading(false);
    }
  }, [userId]);

  const fetchCart = async (showLoading = false) => {
    if (!userId) return;

    if (showLoading) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("carts")
        .select(
          `
          id,
          product_id,
          quantity,
          products (
            name,
            price,
            quantity,
            image_url
          )
        `,
        )
        .eq("user_id", userId);

      if (error) {
        console.error("Fetch cart error:", error);
        throw error;
      }

      const formattedItems: CartItem[] = (data || []).map((item: any) => {
        const product = item.products;
        return {
          id: item.id,
          product_id: item.product_id,
          name: product?.name ?? "Unknown Product",
          price: product?.price ?? 0,
          quantity: item.quantity,
          stock: product?.quantity ?? 0,
          image_url: product?.image_url ?? "",
        };
      });

      setItems(formattedItems);
    } catch (error) {
      console.error("Error fetching cart:", error);
    } finally {
      setLoading(false);
    }
  };

  const refreshCart = async () => {
    await fetchCart();
  };

  const addItem = async (product: any) => {
    if (!userId) {
      toast.error("Please login first");
      router.push('/auth/login');
      return;
    }

    try {
      const existingItem = items.find((i) => i.product_id === product.id);

      if (existingItem) {
        const newQuantity = existingItem.quantity + 1;
        const { error } = await supabase
          .from("carts")
          .update({ quantity: newQuantity })
          .eq("user_id", userId)
          .eq("product_id", product.id);

        if (error) throw error;
        setItems((prev) =>
          prev.map((i) =>
            i.product_id === product.id ? { ...i, quantity: newQuantity } : i,
          ),
        );
      } else {
        const { error } = await supabase.from("carts").insert({
          user_id: userId,
          product_id: product.id,
          quantity: 1,
        });

        if (error) throw error;
        // Need full product data for new items — silent fetch without loading flash
        await fetchCart();
      }
    } catch (error) {
      console.error("Error adding to cart:", error);
      throw error;
    }
  };

  const removeItem = async (productId: string) => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from("carts")
        .delete()
        .eq("user_id", userId)
        .eq("product_id", productId);

      if (error) throw error;
      setItems((prev) => prev.filter((i) => i.product_id !== productId));
    } catch (error) {
      console.error("Error removing item:", error);
      throw error;
    }
  };

  const updateQuantity = async (productId: string, quantity: number) => {
    if (!userId) return;

    if (quantity <= 0) {
      await removeItem(productId);
      return;
    }

    try {
      const { error } = await supabase
        .from("carts")
        .update({ quantity })
        .eq("user_id", userId)
        .eq("product_id", productId);

      if (error) throw error;
      setItems((prev) =>
        prev.map((i) =>
          i.product_id === productId ? { ...i, quantity } : i,
        ),
      );
    } catch (error) {
      console.error("Error updating quantity:", error);
      throw error;
    }
  };

  const clearCart = async () => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from("carts")
        .delete()
        .eq("user_id", userId);

      if (error) throw error;

      setItems([]);
    } catch (error) {
      console.error("Error clearing cart:", error);
      throw error;
    }
  };

  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        total,
        itemCount,
        loading,
        refreshCart,
        userId,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within CartProvider");
  }
  return context;
};
