import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Standards from "./pages/Standards";
import Categories from "./pages/Categories";
import About from "./pages/About";
import Recommend from "./pages/Recommend";

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/standards" element={<Standards />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/recommend" element={<Recommend />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </>
  );
}
