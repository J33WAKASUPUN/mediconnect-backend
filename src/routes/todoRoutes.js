const express = require('express');
const router = express.Router();
const {
    getTodos,
    createTodo,
    updateTodo,
    deleteTodo,
    toggleTodoStatus
} = require('../controllers/todoController');
const { protect, authorize } = require('../middleware/auth');

// All routes are protected and only for doctors
router.use(protect);
router.use(authorize('doctor'));

router.route('/')
    .get(getTodos)
    .post(createTodo);

router.route('/:id')
    .put(updateTodo)
    .delete(deleteTodo);

router.put('/:id/toggle', toggleTodoStatus);

module.exports = router;