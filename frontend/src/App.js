import React, { useState, useEffect, useCallback } from 'react';
import './App.css';


const API_BASE = process.env.REACT_APP_API_BASE || 'https://olo-87gs.vercel.app';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [username, setUsername] = useState('');
  const [currentHashtag, setCurrentHashtag] = useState('General');
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [userReactions, setUserReactions] = useState({});

  const hashtags = ['General', 'Trip', 'CollegeEvents', 'Studies', 'Memes', 'Jobs', 'Confessions', 'Sports'];

  const fetchPosts = useCallback(async (offset = 0) => {
    try {
      const response = await fetch(`${API_BASE}/posts/${currentHashtag}?limit=20&offset=${offset}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      
      if (response.ok) {
        const data = await response.json();
        const postsWithCounts = (data.posts || data).map(post => ({
          ...post,
          smacks: post.smacks || 0,
          caps: post.caps || 0,
          replies: (post.replies || []).map(reply => ({
            ...reply,
            smacks: reply.smacks || 0,
            caps: reply.caps || 0
          }))
        }));
        setPosts(postsWithCounts);
        
        // 🚀 CRITICAL: Get user's current reactions from server
        if (data.user_reactions) {
          setUserReactions(data.user_reactions);
        }
      } else if (response.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        alert('Session expired. Please login again.');
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
    }
  }, [currentHashtag, token]);

  useEffect(() => {
    if (token) {
      fetchPosts();
      const interval = setInterval(fetchPosts, 120000);
      return () => clearInterval(interval);
    }
  }, [token, fetchPosts]);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      try {
        // A simple function to decode the JWT payload
        const parseJwt = (token) => {
          return JSON.parse(atob(token.split('.')[1]));
        };
        
        const decodedToken = parseJwt(storedToken);

        // Check if the token is expired before setting the username
        if (decodedToken.exp * 1000 > Date.now()) {
          setUsername(decodedToken.username);
        } else {
          // Token is expired, so clear it
          localStorage.removeItem('token');
          setToken(null);
        }
      } catch (e) {
        console.error('Failed to parse token:', e);
        // If token is malformed, clear it
        localStorage.removeItem('token');
        setToken(null);
      }
    }
  }, []); 
  const clearCache = async (email) => {
    try {
      const response = await fetch(`${API_BASE}/auth/clear-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`✅ ${data.message} - Try login again!`);
      } else {
        alert('Cache clear failed');
      }
    } catch (error) {
      alert('Cache clear failed');
    }
  };

  const handleLogin = async (email, password, role, agreed) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email.trim().toLowerCase(), 
          password, 
          role: role.toLowerCase(),
          agreed_disclaimer: agreed 
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setToken(data.token);
        setUsername(data.username);
        localStorage.setItem('token', data.token);
        setTimeout(() => {
          alert(`Welcome to College Social! You are now ${data.username} 🎉`);
        }, 500);
      } else {
        throw new Error(data.detail || 'Login failed');
      }
    } catch (error) {
      alert(`Login failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const createPost = async () => {
    if (!newPost.trim()) return;
    
    try {
      const postData = {
        content: newPost.trim(),
        hashtag: currentHashtag
      };
      
      if (replyingTo) {
        postData.parent_id = replyingTo.id;
      }
      
      const response = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(postData)
      });
      
      if (response.ok) {
        setNewPost('');
        setReplyingTo(null);
        fetchPosts();
      } else {
        const error = await response.json();
        alert(error.detail || 'Failed to create post');
      }
    } catch (error) {
      alert('Failed to create post');
    }
  };

  // 🚀 COMPLETELY FIXED: Immediate UI + Guaranteed Server Sync
// 🚀 FIXED: Instant synchronized button state updates
// 🚀 FIXED: Instant UI + Perfect Server Sync (App.js)
// 🚀 FINAL DEBUGGING VERSION (App.js)
const reactToPost = async (postId, reactionType, isReply = false) => {
  console.clear(); // Clears the console for a clean log
  console.log(`%c--- CLICK DETECTED ---`, 'color: #f0f; font-size: 16px;', { postId, reactionType, isReply });

  if (loadingReactions[postId]) {
    console.warn('Request already in flight. Click blocked.');
    return;
  }
  setLoadingReactions(prev => ({ ...prev, [postId]: true }));

  const currentReaction = userReactions[postId];
  const oldPosts = posts;

  // --- STEP 1: CALCULATE THE NEW STATE ---
  const newReactionState = currentReaction === reactionType ? null : reactionType;
  console.log('%cSTATE CALCULATION:', 'color: #0ff;', { currentReaction, newReactionState });

  // --- STEP 2: OPTIMISTICALLY UPDATE UI ---
  setUserReactions(prev => ({ ...prev, [postId]: newReactionState }));

  setPosts(prevPosts => {
    console.log('%cUpdating posts optimistically...', 'color: orange;');
    
    const getUpdatedItem = (item) => {
      if (item.id !== postId) return item;

      console.log(`%cBEFORE optimistic update for ID ${item.id}:`, 'color: red;', { smacks: item.smacks, caps: item.caps });

      const newItem = { ...item };
      
      // Handle smack count change
      if (currentReaction === 'smack' && newReactionState !== 'smack') {
        newItem.smacks -= 1;
      } else if (currentReaction !== 'smack' && newReactionState === 'smack') {
        newItem.smacks += 1;
      }

      // Handle cap count change
      if (currentReaction === 'cap' && newReactionState !== 'cap') {
        newItem.caps -= 1;
      } else if (currentReaction !== 'cap' && newReactionState === 'cap') {
        newItem.caps += 1;
      }

      newItem.smacks = Math.max(0, newItem.smacks || 0);
      newItem.caps = Math.max(0, newItem.caps || 0);

      console.log(`%cAFTER optimistic update for ID ${item.id}:`, 'color: green;', { smacks: newItem.smacks, caps: newItem.caps });
      
      return newItem;
    };

    return prevPosts.map(post => {
      if (isReply && post.replies) {
        return { ...post, replies: post.replies.map(getUpdatedItem) };
      }
      return getUpdatedItem(post);
    });
  });

  // --- STEP 3: SYNC WITH SERVER ---
  try {
    const response = await fetch(`${API_BASE}/posts/${postId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ type: reactionType })
    });

    if (!response.ok) throw new Error('Server error');

    const data = await response.json();
    console.log('%cSERVER RESPONSE (Source of Truth):', 'color: #9f0;', data);

    // Sync UI with the authoritative server response
    setUserReactions(prev => ({ ...prev, [postId]: data.user_reaction }));

    setPosts(prevPosts => {
      const syncItem = (item) => item.id === postId ? { ...item, smacks: data.smacks, caps: data.caps } : item;
      return prevPosts.map(post => {
        if (isReply && post.replies) {
          return { ...post, replies: post.replies.map(syncItem) };
        }
        return syncItem(post);
      });
    });

  } catch (error) {
    console.error('Reaction failed, reverting UI.', error);
    setPosts(oldPosts);
    setUserReactions(prev => ({ ...prev, [postId]: currentReaction }));
  } finally {
    setLoadingReactions(prev => ({ ...prev, [postId]: false }));
  }
};
// Also, you need to add a new state to handle the loading
// Add this near your other useState hooks at the top of App()
const [loadingReactions, setLoadingReactions] = useState({});

  const reportPost = async (postId) => {
    const confirmed = window.confirm('Are you sure you want to report this post?');
    if (!confirmed) return;
    
    try {
      const response = await fetch(`${API_BASE}/posts/${postId}/report`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        alert(`Post reported! ${data.report_count}/${data.threshold} reports needed to remove it.`);
        fetchPosts();
      } else {
        const error = await response.json();
        alert(error.detail || 'Report failed');
      }
    } catch (error) {
      alert('Report failed');
    }
  };

  const handleReply = (post) => {
    setReplyingTo(post);
    setNewPost(`@${post.username} `);
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setNewPost('');
  };

  const handleImageUpload = async (file) => {
    if (!file) return;
    
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE}/upload-image`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      
      if (response.ok) {
        const data = await response.json();
        setNewPost(prev => prev + '\n\n' + data.ascii_art);
      } else {
        alert('Image upload failed');
      }
    } catch (error) {
      alert('Image upload failed');
    } finally {
      setImageUploading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUsername('');
    setPosts([]);
    setNewPost('');
    setReplyingTo(null);
  };

  if (!token) {
    return <LoginPage onLogin={handleLogin} onClearCache={clearCache} loading={loading} />;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <header className="bg-gray-800 shadow-lg border-b border-gray-700 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-blue-400">🎓 College Social</h1>
            <span className="text-sm text-gray-400 hidden sm:block">Anonymous Campus Discussions</span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-300">Hey, <span className="text-blue-400 font-medium">{username}</span>! 👋</span>
            <button 
              onClick={logout}
              className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <nav className="bg-gray-800 border-b border-gray-700 sticky top-16 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex space-x-2 overflow-x-auto scrollbar-hide">
            {hashtags.map(tag => (
              <button
                key={tag}
                onClick={() => setCurrentHashtag(tag)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                  currentHashtag === tag 
                    ? 'bg-blue-600 text-white shadow-lg scale-105' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
                }`}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <PostComposer 
          newPost={newPost}
          setNewPost={setNewPost}
          onSubmit={createPost}
          onImageUpload={handleImageUpload}
          hashtag={currentHashtag}
          imageUploading={imageUploading}
          replyingTo={replyingTo}
          onCancelReply={cancelReply}
        />
        <PostsList 
          posts={posts} 
          hashtag={currentHashtag}
          onReact={reactToPost}
          onReport={reportPost}
          onReply={handleReply}
          userReactions={userReactions}
        />
      </main>
    </div>
  );
}

// ... (keep all other components: LoginPage, PostComposer, PostsList, PostCard exactly the same)

function LoginPage({ onLogin, onClearCache, loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [agreed, setAgreed] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (agreed && !loading) {
      onLogin(email, password, role, agreed);
    }
  };

  const handleClearCache = () => {
    if (!email.trim()) {
      alert('Please enter your email first');
      return;
    }
    onClearCache(email);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🎓</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">College Social</h1>
          <p className="text-blue-300">Anonymous campus discussions</p>
        </div>
        
        <div className="bg-yellow-900/50 border border-yellow-600 rounded-lg p-4 mb-6 backdrop-blur-sm">
          <h3 className="text-lg font-medium text-yellow-300 flex items-center gap-2 mb-2">
            ⚠️ Important Notice
          </h3>
          <p className="text-sm text-yellow-100 mb-3">
            Posts are monitored by the community. We don't moderate content — 
            the community decides through reporting. Your ERP credentials are only 
            used for verification and are never stored.
          </p>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-yellow-100">I understand and agree</span>
          </label>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Select Your Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              required
              disabled={loading}
            >
              <option value="student">Student</option>
              <option value="staff">Staff</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              ERP Email/Username
            </label>
            <input
              type="email"
              placeholder="Enter your ERP email or username"  
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              ERP Password
            </label>
            <input
              type="password"
              placeholder="Your ERP password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 text-white px-3 py-3 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              required
              disabled={loading}
            />
          </div>

          <button 
            type="submit" 
            disabled={!agreed || loading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                <span>Verifying with ERP...</span>
              </>
            ) : (
              <>
                <span>🔐</span>
                <span>Login with ERP</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-4">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-gray-400 text-xs underline"
          >
            🔧 Debug Options
          </button>
          
          {showDebug && (
            <div className="mt-2 p-3 bg-gray-800 rounded-lg border border-gray-600">
              <h4 className="text-sm font-medium text-gray-300 mb-2">🛠️ Debug Tools</h4>
              <button
                onClick={handleClearCache}
                className="w-full py-2 px-3 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded transition-colors"
              >
                🧹 Clear Cache & Try Fresh Login
              </button>
              <p className="text-xs text-gray-400 mt-2">
                Use this if getting "cached failed login" error
              </p>
            </div>
          )}
        </div>
        
        <p className="text-xs text-gray-400 text-center mt-6">
          Your credentials are only used for verification and are never stored on our servers.
        </p>
      </div>
    </div>
  );
}

function PostComposer({ newPost, setNewPost, onSubmit, onImageUpload, hashtag, imageUploading, replyingTo, onCancelReply }) {
  const fileInputRef = React.useRef(null);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      onImageUpload(file);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      onSubmit();
    }
  };

  return (
    <div className="bg-gray-800 rounded-xl p-6 mb-6 shadow-xl border border-gray-700">
      {replyingTo && (
        <div className="mb-4 p-3 bg-blue-900/20 border border-blue-600 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-blue-300 text-sm">
              Replying to <span className="font-medium">@{replyingTo.username}</span>
            </span>
            <button
              onClick={onCancelReply}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center space-x-2 mb-4">
        <span className="text-blue-400 font-medium">#{hashtag}</span>
        <span className="text-gray-500">•</span>
        <span className="text-gray-400 text-sm">
          {replyingTo ? 'Reply to the conversation...' : "What's on your mind?"}
        </span>
      </div>
      
      <textarea
        value={newPost}
        onChange={(e) => setNewPost(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={`${replyingTo ? 'Write your reply...' : `Share something in #${hashtag}...`} (Ctrl+Enter to post)`}
        className="w-full bg-gray-700 border border-gray-600 text-white p-4 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-gray-400"
        rows="4"
        maxLength={2000}
      />
      
      <div className="flex justify-between items-center mt-4">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleImageClick}
            disabled={imageUploading}
            className="flex items-center space-x-2 text-gray-400 hover:text-blue-400 transition-colors disabled:opacity-50"
          >
            {imageUploading ? (
              <div className="animate-spin h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full"></div>
            ) : (
              <span>🖼️</span>
            )}
            <span className="text-sm">Add Image (converts to ASCII)</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
        
        <div className="flex items-center space-x-3">
          <span className="text-sm text-gray-400">
            {newPost.length}/2000
          </span>
          <button
            onClick={onSubmit}
            disabled={!newPost.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {replyingTo ? 'Reply 💬' : 'Post 🚀'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PostsList({ posts, hashtag, onReact, onReport, onReply, userReactions }) {
  if (posts.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-6xl mb-4">💬</div>
        <h3 className="text-2xl font-bold text-gray-300 mb-2">No posts yet in #{hashtag}</h3>
        <p className="text-gray-400 text-lg">Be the first to start the conversation!</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {posts.map(post => (
        <PostCard
          key={post.id}
          post={post}
          onReact={onReact}
          onReport={onReport}
          onReply={onReply}
          userReactions={userReactions}
        />
      ))}
    </div>
  );
}

function PostCard({ post, onReact, onReport, onReply, userReactions }) {
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showAllReplies, setShowAllReplies] = useState(false);

  const handleReport = () => {
    setShowReportDialog(false);
    onReport(post.id);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / 1000 / 60);
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const visibleReplies = showAllReplies ? (post.replies || []) : (post.replies || []).slice(0, 3);
  const hasMoreReplies = (post.replies || []).length > 3;

  return (
    <div className="bg-gray-800 rounded-xl p-6 shadow-xl border border-gray-700 hover:border-gray-600 transition-all">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
            <span className="text-xs font-bold">{post.username.charAt(0)}</span>
          </div>
          <span className="text-blue-400 font-medium">{post.username}</span>
          <span className="text-gray-500">•</span>
          <span className="text-gray-400 text-sm">{formatTime(post.created_at)}</span>
        </div>
        
        {post.report_count > 0 && (
          <span className="bg-red-900/50 text-red-300 px-2 py-1 rounded text-xs">
            {post.report_count} reports
          </span>
        )}
      </div>
      
      {/* Content */}
      <div className="mb-4">
        <pre className="whitespace-pre-wrap text-gray-100 font-sans leading-relaxed">
          {post.content}
        </pre>
      </div>
      
      {/* 🚀 CLEAN SIMPLE BUTTONS */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => onReact(post.id, 'smack', false)}
            className={`px-4 py-2 rounded font-medium transition-colors duration-150 ${
              userReactions[post.id] === 'smack'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            👊 Smack {post.smacks || 0}
          </button>
          
          <button
            onClick={() => onReact(post.id, 'cap', false)}
            className={`px-4 py-2 rounded font-medium transition-colors duration-150 ${
              userReactions[post.id] === 'cap'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            🧢 Cap {post.caps || 0}
          </button>

          <button
            onClick={() => onReply(post)}
            className="px-4 py-2 bg-gray-700 text-gray-300 hover:bg-gray-600 rounded font-medium transition-colors duration-150"
          >
            💬 Comment {post.replies?.length || 0}
          </button>
        </div>
        
        <button
          onClick={() => setShowReportDialog(true)}
          className="px-4 py-2 bg-gray-700 text-gray-300 hover:bg-red-600 rounded font-medium transition-colors duration-150"
        >
          🚨 Report
        </button>
      </div>

      {/* Comments */}
      {post.replies && post.replies.length > 0 && (
        <div className="space-y-3 border-l-2 border-gray-600 pl-4 ml-4">
          {visibleReplies.map(reply => (
            <div key={reply.id} className="bg-gray-700 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-6 h-6 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold">{reply.username.charAt(0)}</span>
                </div>
                <span className="text-blue-300 text-sm font-medium">{reply.username}</span>
                <span className="text-gray-500 text-xs">•</span>
                <span className="text-gray-400 text-xs">{formatTime(reply.created_at)}</span>
              </div>
              
              <pre className="whitespace-pre-wrap text-gray-200 text-sm font-sans leading-relaxed mb-2">
                {reply.content}
              </pre>
              
              {/* 🚀 SIMPLE COMMENT BUTTONS */}
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => onReact(reply.id, 'smack', true)}
                  className={`px-3 py-1 text-sm rounded font-medium transition-colors duration-150 ${
                    userReactions[reply.id] === 'smack'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                  }`}
                >
                  👊 {reply.smacks || 0}
                </button>
                
                <button
                  onClick={() => onReact(reply.id, 'cap', true)}
                  className={`px-3 py-1 text-sm rounded font-medium transition-colors duration-150 ${
                    userReactions[reply.id] === 'cap'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
                  }`}
                >
                  🧢 {reply.caps || 0}
                </button>
                
                <button
                  onClick={() => onReport(reply.id)}
                  className="px-3 py-1 text-sm bg-gray-600 text-gray-300 hover:bg-red-600 rounded font-medium transition-colors duration-150"
                >
                  🚨 Report
                </button>
              </div>
            </div>
          ))}

          {hasMoreReplies && !showAllReplies && (
            <button
              onClick={() => setShowAllReplies(true)}
              className="text-blue-400 hover:text-blue-300 text-sm pl-2 pt-2 transition-colors"
            >
              👁️ View {post.replies.length - 3} more comments
            </button>
          )}

          {showAllReplies && hasMoreReplies && (
            <button
              onClick={() => setShowAllReplies(false)}
              className="text-blue-400 hover:text-blue-300 text-sm pl-2 pt-2 transition-colors"
            >
              👀 Show less comments
            </button>
          )}
        </div>
      )}

      {/* Report dialog - keep same */}
      {showReportDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-600 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-2">Report this post?</h3>
            <p className="text-gray-300 mb-4">
              This post will be automatically removed if it receives 20 reports from the community.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleReport}
                className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-medium"
              >
                Report
              </button>
              <button
                onClick={() => setShowReportDialog(false)}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default App;
