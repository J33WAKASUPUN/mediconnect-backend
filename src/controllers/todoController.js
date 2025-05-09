const Todo = require('../models/TodoModel');
const { getCurrentUTC } = require('../utils/dateTime');
const logger = require('../utils/logger');

// @desc    Get todos for a specific date or date range
// @route   GET /api/todos
// @access  Private (Doctor only)
exports.getTodos = async (req, res, next) => {
    try {
        const { startDate, endDate } = req.query;
        
        if (!startDate) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Start date is required'
            });
        }
        
        const query = {
            doctorId: req.user.id,
            date: {}
        };
        
        // Set date range or single date
        if (endDate) {
            query.date = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        } else {
            // For a specific date, get all todos on that date
            const specificDate = new Date(startDate);
            const nextDay = new Date(specificDate);
            nextDay.setDate(nextDay.getDate() + 1);
            
            query.date = {
                $gte: specificDate,
                $lt: nextDay
            };
        }
        
        const todos = await Todo.find(query).sort({ date: 1, time: 1 });
        
        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            count: todos.length,
            data: todos
        });
        
    } catch (error) {
        logger.error(`Error in getTodos: ${error.message}`);
        next(error);
    }
};

// @desc    Create new todo
// @route   POST /api/todos
// @access  Private (Doctor only)
exports.createTodo = async (req, res, next) => {
    try {
        const { date, title, description, priority, time } = req.body;
        
        // Validate date
        const todoDate = new Date(date);
        if (isNaN(todoDate.getTime())) {
            return res.status(400).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Invalid date format'
            });
        }
        
        // Validate time format if provided
        if (time) {
            const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(time)) {
                return res.status(400).json({
                    success: false,
                    timestamp: getCurrentUTC(),
                    message: 'Invalid time format. Use HH:MM format'
                });
            }
        }
        
        const todo = await Todo.create({
            doctorId: req.user.id,
            date: todoDate,
            title,
            description,
            priority,
            time,
            createdAt: getCurrentUTC(),
            updatedAt: getCurrentUTC()
        });
        
        res.status(201).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: todo
        });
        
    } catch (error) {
        logger.error(`Error in createTodo: ${error.message}`);
        next(error);
    }
};

// @desc    Update todo
// @route   PUT /api/todos/:id
// @access  Private (Doctor only)
exports.updateTodo = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { title, description, priority, completed, date, time } = req.body;
        
        // Find todo and check ownership
        let todo = await Todo.findById(id);
        
        if (!todo) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Todo not found'
            });
        }
        
        // Check ownership
        if (todo.doctorId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to update this todo'
            });
        }
        
        // Prepare update data
        const updateData = {
            title,
            description,
            priority,
            completed,
            updatedAt: getCurrentUTC()
        };
        
        // Update date if provided
        if (date) {
            const todoDate = new Date(date);
            if (isNaN(todoDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    timestamp: getCurrentUTC(),
                    message: 'Invalid date format'
                });
            }
            updateData.date = todoDate;
        }
        
        // Update time if provided
        if (time) {
            const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(time)) {
                return res.status(400).json({
                    success: false,
                    timestamp: getCurrentUTC(),
                    message: 'Invalid time format. Use HH:MM format'
                });
            }
            updateData.time = time;
        }
        
        // Update todo
        todo = await Todo.findByIdAndUpdate(id, updateData, {
            new: true,
            runValidators: true
        });
        
        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: todo
        });
        
    } catch (error) {
        logger.error(`Error in updateTodo: ${error.message}`);
        next(error);
    }
};

// @desc    Delete todo
// @route   DELETE /api/todos/:id
// @access  Private (Doctor only)
exports.deleteTodo = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        const todo = await Todo.findById(id);
        
        if (!todo) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Todo not found'
            });
        }
        
        // Check ownership
        if (todo.doctorId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to delete this todo'
            });
        }
        
        // Changed from todo.remove() to Todo.findByIdAndDelete()
        await Todo.findByIdAndDelete(id);
        
        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            message: 'Todo deleted successfully',
            data: {}
        });
        
    } catch (error) {
        logger.error(`Error in deleteTodo: ${error.message}`);
        next(error);
    }
};

// @desc    Toggle todo completion status
// @route   PUT /api/todos/:id/toggle
// @access  Private (Doctor only)
exports.toggleTodoStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        
        let todo = await Todo.findById(id);
        
        if (!todo) {
            return res.status(404).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Todo not found'
            });
        }
        
        // Check ownership
        if (todo.doctorId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                timestamp: getCurrentUTC(),
                message: 'Not authorized to update this todo'
            });
        }
        
        todo = await Todo.findByIdAndUpdate(id, {
            completed: !todo.completed,
            updatedAt: getCurrentUTC()
        }, {
            new: true
        });
        
        res.status(200).json({
            success: true,
            timestamp: getCurrentUTC(),
            data: todo
        });
        
    } catch (error) {
        logger.error(`Error in toggleTodoStatus: ${error.message}`);
        next(error);
    }
};